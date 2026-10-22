import logging
import discord
from discord import app_commands
from .youtube import PlaylistError

log = logging.getLogger(__name__)


class MusicBot(discord.Client):
    def __init__(self, playlist, guild_id, channel_id, excluded):
        super().__init__(intents=discord.Intents(guilds=True), allowed_mentions=discord.AllowedMentions.none())
        self.playlist, self.guild_id, self.channel_id = playlist, guild_id, channel_id
        self.excluded = excluded
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
        @self.tree.command(name='추가', description='유튜브 영상을 공용 재생목록에 추가합니다')
        async def add(interaction: discord.Interaction, 링크: str):
            if interaction.user.bot or interaction.user.id in self.excluded:
                await interaction.response.send_message('추가 대상에서 제외된 계정입니다.', ephemeral=True)
                return
            await interaction.response.defer(thinking=True)
            try:
                item_id = await self.playlist.add(링크, interaction.user.id)
                await interaction.followup.send(
                    f'✅ 재생목록에 추가했어요.\n삭제용 항목 ID: `{item_id}`\n'
                    f'[재생목록](<{self.playlist.youtube.url}>)', suppress_embeds=True)
            except PlaylistError as error:
                await interaction.followup.send(str(error))

        @self.tree.command(name='목록', description='실제 유튜브 재생목록을 조회합니다')
        async def listing(interaction: discord.Interaction, 페이지: app_commands.Range[int, 1] = 1):
            await interaction.response.defer(ephemeral=True, thinking=True)
            try:
                items = await self.playlist.list()
                pages = max(1, (len(items) + 9) // 10)
                if 페이지 > pages:
                    raise PlaylistError(f'마지막 페이지는 {pages}페이지예요.')
                embed = discord.Embed(title=f'🎵 공용 재생목록 · {len(items)}곡', url=self.playlist.youtube.url, color=0xb8d87a)
                for item in items[(페이지-1)*10:페이지*10]:
                    title = discord.utils.escape_markdown(item['title'][:150])
                    link = f"[유튜브에서 보기](https://youtu.be/{item['video_id']})" if item['video_id'] else '재생 불가 영상'
                    embed.add_field(name=title, value=f"{link}\n삭제용 항목 ID: `{item['id']}`", inline=False)
                if not items:
                    embed.description = '아직 추가된 곡이 없어요. /추가로 곡을 추가해주세요.'
                embed.set_footer(text=f'{페이지}/{pages}페이지 · /목록 페이지:2 · /삭제 항목ID:…')
                await interaction.followup.send(content=f'🎵 공용 재생목록 · {len(items)}곡 · {페이지}/{pages}페이지', embed=embed, ephemeral=True)
            except PlaylistError as error:
                await interaction.followup.send(str(error), ephemeral=True)

        @self.tree.command(name='삭제', description='재생목록에서 본인이 추가한 곡을 제거합니다. 관리자는 모든 곡을 제거할 수 있습니다')
        async def delete(interaction: discord.Interaction, 항목id: str):
            await interaction.response.defer(ephemeral=True, thinking=True)
            try:
                await self.playlist.delete(항목id.strip(), interaction.user.id, interaction.permissions.administrator)
                await interaction.followup.send('재생목록에서 제거했어요. 원본 유튜브 영상은 삭제되지 않습니다.', ephemeral=True)
            except PlaylistError as error:
                await interaction.followup.send(str(error), ephemeral=True)

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
