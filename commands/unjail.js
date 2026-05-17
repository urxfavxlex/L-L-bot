const discordTranscripts = require('discord-html-transcripts');
const db = require('../database');
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
module.exports = {
    data: new SlashCommandBuilder()
        .setName('unjail')
        .setDescription('Unjail a member')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to unjail')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    async execute(interaction) {
        await interaction.reply({
    content: 'Unjailing member...',
    ephemeral: true
});
        const member = interaction.options.getMember('user');
        const jailedRoleId = process.env.JAILED_ROLE_ID;

        if (!member) {
            return interaction.editReply({ content: 'User not found.', ephemeral: true });
        }

       try {
    await member.roles.remove(jailedRoleId);
    console.log(`Removed jailed role from ${member.user.tag}`);
} catch (err) {
    console.error('Could not remove jailed role:', err);
}

        const row = db.prepare(`
            SELECT roles FROM jailed_users
            WHERE user_id = ?
        `).get(member.id);

        if (row) {
            const roles = JSON.parse(row.roles);

            for (const roleId of roles) {
                try {
                    await member.roles.add(roleId);
                } catch (err) {
                    console.log(`Could not restore role ${roleId}: ${err.message}`);
                }
            }

            db.prepare(`
                DELETE FROM jailed_users
                WHERE user_id = ?
            `).run(member.id);
        }

        const logChannel = interaction.guild.channels.cache.get(process.env.MOD_LOG_CHANNEL_ID);

const jailChannels = interaction.guild.channels.cache.filter(
    ch => ch.name === `jail-${member.user.username.toLowerCase()}`
);

for (const channel of jailChannels.values()) {
    const attachment = await discordTranscripts.createTranscript(channel, {
        limit: -1,
        returnType: 'attachment',
        filename: `${channel.name}.html`
    });

    if (logChannel) {
        const transcriptEmbed = new EmbedBuilder()
            .setTitle('Ticket Closed')
            .setDescription(
                `**Name:** ${channel.name}\n\n` +
                `__**Owner**__\n` +
                `ID: ${member.id}\n` +
                `Mention: ${member}\n` +
                `Display Name: ${member.displayName}\n\n` +
                `__**Closed By**__\n` +
                `ID: ${interaction.user.id}\n` +
                `Mention: ${interaction.user}\n` +
                `Display Name: ${interaction.member.displayName}\n\n` +
                `__**Close Reason**__\n` +
                `No reason provided.`
            )
            .setColor('#ff4da6')
            .setTimestamp();

        await logChannel.send({
            embeds: [transcriptEmbed],
            files: [attachment]
        });
    }
}

await interaction.followUp({
    content: `${member} has been unjailed and the jail transcript was saved.`,
    ephemeral: true
});
    }
};