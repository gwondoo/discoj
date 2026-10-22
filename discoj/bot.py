import logging
import asyncio
import discord
from discord import app_commands
from .youtube import PlaylistError

log = logging.getLogger(__name__)


class PlaylistView(discord.ui.View):
    def __init__(self, items, url, playlist=None):
        super().__init__(timeout=300)
        self.playlist = playlist
        self.refresh_lock = asyncio.Lock()
        self.items, self.page = items, 0
        self.pages = max(1, (len(items) + 4) // 5)
        self.add_item(discord.ui.Button(label='유튜브 재생목록 보기',
                                       style=discord.ButtonStyle.link, url=url, row=1))
        self.update_buttons()

    def update_buttons(self):
        self.previous.disabled = self.page == 0
        self.next_page.disabled = self.page == self.pages - 1

    def content(self):
        lines = [f'🎵 **공용 재생목록 · {len(self.items)}곡**']
        for item in self.items[self.page * 5:(self.page + 1) * 5]:
            title = discord.utils.escape_markdown(' '.join(item['title'].split()))[:140]
            lines.append(f"`{item['number']}` · {title}")
        if not self.items:
            lines.append('아직 추가된 곡이 없어요. /추가로 곡을 추가해주세요.')
        lines.append(f'\n{self.page + 1}/{self.pages}페이지')
        return '\n'.join(lines)

    @discord.ui.button(label='이전', style=discord.ButtonStyle.secondary)
    async def previous(self, interaction, button):
        self.page = max(0, self.page - 1)
        self.update_buttons()
        await interaction.response.edit_message(content=self.content(), view=self)

    @discord.ui.button(label='다음', style=discord.ButtonStyle.secondary)
    async def next_page(self, interaction, button):
        self.page = min(self.pages - 1, self.page + 1)
        self.update_buttons()
        await interaction.response.edit_message(content=self.content(), view=self)

    @discord.ui.button(label='새로고침', style=discord.ButtonStyle.secondary)
    async def refresh(self, interaction, button):
        await interaction.response.defer()
        async with self.refresh_lock:
            try:
                items = await self.playlist.list()
                self.items = items
                self.pages = max(1, (len(items) + 4) // 5)
                self.page = min(self.page, self.pages - 1)
                self.update_buttons()
                content = self.content()
            except PlaylistError as error:
                content = f'{error}\n\n이전에 조회한 목록이에요.\n' + self.content()
            await interaction.edit_original_response(content=content, view=self)


def playlist_link(url):
    view = discord.ui.View()
    view.add_item(discord.ui.Button(label='유튜브 재생목록 보기',
                                   style=discord.ButtonStyle.link, url=url))
    return view


class DeleteConfirmation(discord.ui.View):
    def __init__(self, playlist, item, user_id):
        super().__init__(timeout=120)
        self.playlist, self.item, self.user_id = playlist, item, user_id
        self.lock = asyncio.Lock()
        self.finished = False

    async def interaction_check(self, interaction):
        if interaction.user.id != self.user_id:
            await interaction.response.send_message('명령을 실행한 사람만 확인할 수 있어요.', ephemeral=True)
            return False
        return True

    @discord.ui.button(label='삭제', style=discord.ButtonStyle.danger)
    async def confirm(self, interaction, button):
        await interaction.response.defer()
        async with self.lock:
            if self.finished:
                return
            self.finished = True
            try:
                await self.playlist.delete(self.item['number'])
                content = f"{self.item['number']}번을 재생목록에서 제거했어요."
            except PlaylistError as error:
                content = str(error)
            await interaction.edit_original_response(content=content,
                view=playlist_link(self.playlist.youtube.url))
            self.stop()

    @discord.ui.button(label='취소', style=discord.ButtonStyle.secondary)
    async def cancel(self, interaction, button):
        await interaction.response.defer()
        async with self.lock:
            if self.finished:
                return
            self.finished = True
            await interaction.edit_original_response(content='삭제를 취소했어요.', view=None)
            self.stop()



class MusicBot(discord.Client):
    def __init__(self, playlist, guild_id, channel_id, excluded, playback=None):
        super().__init__(intents=discord.Intents(guilds=True), allowed_mentions=discord.AllowedMentions.none())
        self.playlist, self.guild_id, self.channel_id = playlist, guild_id, channel_id
        self.excluded = excluded
        self.playback = playback
        self.tree = app_commands.CommandTree(self)
        self.tree.interaction_check = self.check_channel
        self.tree.on_error = self.command_error
        self.register_commands()

    async def check_channel(self, interaction):
        if interaction.guild_id != self.guild_id or interaction.channel_id != self.channel_id:
            await interaction.response.send_message('지정된 음악 채널에서 사용해주세요.', ephemeral=True)
            return False
        return True

    async def command_error(self, interaction, error):
        # Do not log upstream response bodies, OAuth credentials or user input.
        log.error('Discord command failed: %s', type(error).__name__)
        send = interaction.followup.send if interaction.response.is_done() else interaction.response.send_message
        await send('요청 처리 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.', ephemeral=True)

    def register_commands(self):
        @self.tree.command(name='현재곡', description='연결된 유튜브 탭의 현재 영상 제목과 링크를 확인합니다')
        async def current_video(interaction: discord.Interaction):
            data = self.playback.current() if self.playback else None
            if data is None:
                await interaction.response.send_message('재생 정보를 확인할 수 없어요. 맥미니의 유튜브 탭과 확장 프로그램 연결을 확인해주세요.', ephemeral=True)
                return
            label = '▶️ 현재 재생 중인 영상' if data['state'] == 'playing' else '⏸️ 일시정지된 영상'
            title = discord.utils.escape_markdown(data['title'])[:700]
            view = discord.ui.View()
            view.add_item(discord.ui.Button(label='유튜브에서 보기', style=discord.ButtonStyle.link, url=data['url']))
            await interaction.response.send_message(f'{label}\n**{title}**', view=view, ephemeral=True)

        @self.tree.command(name='추가', description='유튜브 영상을 공용 재생목록에 추가합니다')
        async def add(interaction: discord.Interaction, 링크: str):
            if interaction.user.bot or interaction.user.id in self.excluded:
                await interaction.response.send_message('추가 대상에서 제외된 계정입니다.', ephemeral=True)
                return
            await interaction.response.defer(ephemeral=True, thinking=True)
            try:
                number = await self.playlist.add(링크, interaction.user.id)
                view = discord.ui.View()
                view.add_item(discord.ui.Button(label='유튜브 재생목록 보기',
                                               style=discord.ButtonStyle.link,
                                               url=self.playlist.youtube.url))
                await interaction.followup.send(
                    f'✅ `{number}`번으로 재생목록에 추가했어요.', view=view, ephemeral=True)
            except PlaylistError as error:
                await interaction.followup.send(str(error), view=playlist_link(self.playlist.youtube.url), ephemeral=True)

        @self.tree.command(name='목록', description='곡 번호와 영상 제목으로 공용 재생목록을 조회합니다')
        async def listing(interaction: discord.Interaction):
            await interaction.response.defer(ephemeral=True, thinking=True)
            try:
                items = await self.playlist.list()
                view = PlaylistView(items, self.playlist.youtube.url, self.playlist)
                await interaction.followup.send(view.content(), view=view, ephemeral=True)
            except PlaylistError as error:
                await interaction.followup.send(str(error), view=playlist_link(self.playlist.youtube.url), ephemeral=True)

        @self.tree.command(name='삭제', description='곡 번호로 공용 재생목록의 곡을 제거합니다. 누구나 삭제할 수 있습니다')
        @app_commands.describe(번호='곡 번호를 직접 입력하거나 영상 제목으로 검색하세요.')
        async def delete(interaction: discord.Interaction, 번호: app_commands.Range[int, 1]):
            await interaction.response.defer(ephemeral=True, thinking=True)
            try:
                item = await self.playlist.find(번호)
                if item is None:
                    raise PlaylistError('이미 삭제됐거나 없는 번호예요. /목록을 확인해주세요.')
                title = discord.utils.escape_markdown(' '.join(item['title'].split()))[:300]
                await interaction.followup.send(
                    f'**{번호}번 · {title}**\n이 곡을 재생목록에서 삭제할까요?',
                    view=DeleteConfirmation(self.playlist, item, interaction.user.id), ephemeral=True)
            except PlaylistError as error:
                await interaction.followup.send(str(error), view=playlist_link(self.playlist.youtube.url), ephemeral=True)

        @delete.autocomplete('번호')
        async def delete_choices(interaction: discord.Interaction, current: str):
            if interaction.guild_id != self.guild_id or interaction.channel_id != self.channel_id:
                return []
            return [app_commands.Choice(name=f"{item['number']} · {' '.join(item['title'].split())}"[:100],
                                       value=item['number'])
                    for item in await self.playlist.choices(current)]

    async def setup_hook(self):
        guild = discord.Object(id=self.guild_id)
        self.tree.copy_global_to(guild=guild)
        await self.tree.sync(guild=guild)

    async def on_ready(self):
        log.info('Discord bot connected')
        await self.change_presence(activity=None)
        # Retire the old playback status, retaining the message instead of deleting history.
        try:
            channel = self.get_channel(self.channel_id) or await self.fetch_channel(self.channel_id)
            async for message in channel.history(limit=50):
                if message.author.id == self.user.id and message.embeds and (message.embeds[0].title or '').startswith(('🎵 디스코제이 ·', '디스코제이 · 유튜브 재생목록 관리')):
                    embed = discord.Embed(title='디스코제이 · 유튜브 재생목록 관리', description='/추가 · /목록 · /삭제\n음악은 유튜브 재생목록 페이지에서 재생해주세요.', color=0xb8d87a)
                    await message.edit(embed=embed)
                    if message.pinned:
                        await message.unpin(reason='실시간 재생 표시 기능 종료')
        except discord.HTTPException:
            log.warning('기존 재생 현황 메시지를 갱신하지 못했습니다.')
