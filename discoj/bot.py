import asyncio
import logging
import discord
from discord import app_commands

log = logging.getLogger(__name__)
LABELS = {'offline': '재생 기기 연결 끊김', 'idle': '추천 대기 중', 'loading': '영상 로드 중',
          'playing': '재생 중', 'paused': '일시정지', 'buffering': '버퍼링 중',
          'blocked': '재생 버튼 확인 필요', 'error': '영상 재생 오류'}


def track_line(track):
    return f"#{track['number']} · [{discord.utils.escape_markdown(track['title'])}](https://youtu.be/{track['video_id']}) — {discord.utils.escape_markdown(track['requester'])}"


class MusicBot(discord.Client):
    def __init__(self, queue, guild_id, channel_id, excluded):
        super().__init__(intents=discord.Intents(guilds=True), allowed_mentions=discord.AllowedMentions.none())
        self.queue, self.guild_id, self.channel_id = queue, guild_id, channel_id
        self.excluded = excluded
        self.tree = app_commands.CommandTree(self)
        self.message = None
        self.updater = None
        self.tree.interaction_check = self.check_channel
        self.tree.on_error = self.command_error
        self.register_commands()

    async def check_channel(self, interaction):
        if interaction.guild_id != self.guild_id or interaction.channel_id != self.channel_id:
            await interaction.response.send_message('지정된 음악 채널에서 사용해주세요.', ephemeral=True)
            return False
        return True

    async def command_error(self, interaction, error):
        log.error('Discord command failed', exc_info=error)
        send = interaction.followup.send if interaction.response.is_done() else interaction.response.send_message
        await send('요청 처리 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.', ephemeral=True)

    def register_commands(self):
        @self.tree.command(name='추천', description='유튜브 영상 링크로 노래를 추천합니다')
        async def recommend(interaction: discord.Interaction, 링크: str):
            if interaction.user.bot or interaction.user.id in self.excluded:
                await interaction.response.send_message('추천 대상에서 제외된 계정입니다.', ephemeral=True)
                return
            try:
                track = await self.queue.add(링크, interaction.user.id, interaction.user.display_name)
                await interaction.response.send_message(f'✅ #{track.number} 추천 접수 · https://youtu.be/{track.video_id}')
            except ValueError as error:
                await interaction.response.send_message(str(error), ephemeral=True)

        @self.tree.command(name='목록', description='현재 곡과 대기열을 확인합니다')
        async def listing(interaction: discord.Interaction):
            await interaction.response.send_message(embed=self.embed(), ephemeral=True)

        @self.tree.command(name='현재곡', description='실제 플레이어의 재생 상태를 확인합니다')
        async def current(interaction: discord.Interaction):
            state = self.queue.snapshot()
            text = LABELS[state['status']]
            if state['current']:
                text += '\n' + track_line(state['current'])
            await interaction.response.send_message(text, ephemeral=True)

        @self.tree.command(name='내추천', description='내가 추천한 현재 곡과 대기곡을 확인합니다')
        async def mine(interaction: discord.Interaction):
            state = self.queue.snapshot()
            tracks = ([state['current']] if state['current'] else []) + state['pending']
            tracks = [t for t in tracks if t['user_id'] == str(interaction.user.id)]
            text = '\n'.join(track_line(t) for t in tracks)
            await interaction.response.send_message((text[:1850] or '현재 남아 있는 추천곡이 없어요.'), ephemeral=True)

        @self.tree.command(name='삭제', description='곡을 삭제합니다. 관리자는 다른 사람의 곡도 삭제할 수 있습니다')
        async def delete(interaction: discord.Interaction, 곡번호: app_commands.Range[int, 1]):
            try:
                await self.queue.delete(곡번호, interaction.user.id, interaction.permissions.administrator)
                await interaction.response.send_message(f'#{곡번호} 곡을 삭제했어요. 재생 중인 곡이면 다음 곡으로 넘어갑니다.')
            except ValueError as error:
                await interaction.response.send_message(str(error), ephemeral=True)

        @self.tree.command(name='도움말', description='디스코제이 사용법을 확인합니다')
        async def help_command(interaction: discord.Interaction):
            await interaction.response.send_message('/추천 링크 · /목록 · /현재곡 · /내추천 · /삭제 곡번호\n'
                '접수 순서대로 재생하며 개인 제한은 없어요. 중복 추천은 제외됩니다.\n'
                '추천곡이 없으면 설정된 카페 음악을 재생합니다. 재시작하면 대기열은 초기화됩니다.', ephemeral=True)

    async def setup_hook(self):
        guild = discord.Object(id=self.guild_id)
        self.tree.copy_global_to(guild=guild)
        await self.tree.sync(guild=guild)
        self.updater = asyncio.create_task(self.update_loop())

    async def on_ready(self):
        log.info('Discord bot connected')

    def embed(self):
        state = self.queue.snapshot()
        embed = discord.Embed(title=f"🎵 디스코제이 · {LABELS[state['status']]}", color=0xb8d87a)
        embed.description = track_line(state['current']) if state['current'] else '현재 곡 없음'
        lines = [track_line(t) for t in state['pending'][:10]]
        embed.add_field(name=f"대기곡 {len(state['pending'])}개 · 앞 10곡", value=('\n'.join(lines)[:1000] or '대기곡 없음'), inline=False)
        embed.set_footer(text='영상 제목은 재생 후 반영됩니다. /목록 · /내추천으로 조회하세요.')
        return embed

    async def update_loop(self):
        await self.wait_until_ready()
        previous = None
        while not self.is_closed():
            try:
                state = self.queue.snapshot()
                if state != previous:
                    channel = self.get_channel(self.channel_id) or await self.fetch_channel(self.channel_id)
                    if not self.message:
                        # Reuse a recognizable message across process restarts, avoiding new messages each time.
                        async for message in channel.history(limit=50):
                            if message.author.id == self.user.id and message.embeds and message.embeds[0].title.startswith('🎵 디스코제이 ·'):
                                self.message = message
                                break
                    if self.message:
                        try:
                            await self.message.edit(embed=self.embed())
                        except discord.NotFound:
                            self.message = None
                    if not self.message:
                        self.message = await channel.send(embed=self.embed())
                    if not self.message.pinned:
                        try:
                            await self.message.pin(reason='디스코제이 재생 현황')
                        except discord.Forbidden:
                            pass
                    name = LABELS[state['status']]
                    if state['status'] == 'playing' and state['current']:
                        name = state['current']['title']
                    await self.change_presence(activity=discord.Activity(type=discord.ActivityType.listening, name=name[:100]))
                    previous = state
            except (discord.HTTPException, OSError):
                log.exception('Unable to update Discord status')
            await asyncio.sleep(5)

    async def close(self):
        if self.updater:
            self.updater.cancel()
            await asyncio.gather(self.updater, return_exceptions=True)
        await super().close()
