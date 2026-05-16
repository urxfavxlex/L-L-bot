const discordTranscripts = require('discord-html-transcripts');
const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('verify-panel')
        .setDescription('Send the verification ticket panel')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('Verification')
            .setDescription('Click the button below to open a private verification ticket.')
            .setColor(0xffb6c1);

        const button = new ButtonBuilder()
            .setCustomId('open_verify_ticket')
            .setLabel('Open Verification Ticket')
            .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder().addComponents(button);

        await interaction.reply({
            embeds: [embed],
            components: [row]
        });
    }
};