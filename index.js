const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder
} = require("discord.js");
const fs = require("fs");
const path = require("path");

// =========================
// CONFIG
// =========================
const configPath = path.join(__dirname, "config.json");
let config = JSON.parse(fs.readFileSync(configPath, "utf8"));

function saveConfig() {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

// =========================
// CLIENT
// =========================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember]
});

client.once("ready", () => {
  console.log(`🔥 Bot connecté : ${client.user.tag}`);
});

const prefix = config.prefix;

// =========================
// COMMANDES TEXTE
// =========================
client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/g);
  const cmd = args.shift()?.toLowerCase();

  // -------- !say --------
  if (cmd === "say") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return message.reply("❌ Tu dois être admin pour utiliser cette commande.");

    const text = args.join(" ");
    if (!text) return message.reply("❌ Tu dois écrire un message.");

    await message.delete().catch(() => {});
    return message.channel.send(text);
  }

  // -------- !help --------
  if (cmd === "help") {
    const embed = new EmbedBuilder()
      .setColor("Blue")
      .setTitle("📜 Menu d'aide — ObliShopProtect")
      .setDescription("Choisis une catégorie ci-dessous pour afficher les commandes.")
      .setFooter({ text: "Help Premium • Mode Dashboard" });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("help_utilitaire").setLabel("Utilitaire").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("help_tickets").setLabel("Tickets").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("help_moderation").setLabel("Modération").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("help_autres").setLabel("Autres").setStyle(ButtonStyle.Secondary)
    );

    return message.channel.send({ embeds: [embed], components: [row] });
  }

  // -------- !config --------
  if (cmd === "config") {
    if (message.author.id !== config.ownerId)
      return message.channel.send("❌ Seul l'owner peut ouvrir le panneau de configuration.");

    const embed = new EmbedBuilder()
      .setColor("Purple")
      .setTitle("⚙️ Dashboard — Configuration")
      .setDescription(
        [
          "Bienvenue dans le **panneau de configuration**.",
          "",
          "Choisis une section ci-dessous :",
          "🎫 Tickets",
          "📜 Logs",
          "👋 Bienvenue"
        ].join("\n")
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("cfg_tickets").setLabel("Tickets").setEmoji("🎫").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("cfg_logs").setLabel("Logs").setEmoji("📜").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("cfg_welcome").setLabel("Bienvenue").setEmoji("👋").setStyle(ButtonStyle.Secondary)
    );

    return message.channel.send({ embeds: [embed], components: [row] });
  }

  // -------- !ticket --------
  if (cmd === "ticket") {
    const embed = new EmbedBuilder()
      .setColor("Green")
      .setTitle("🎫 OBLI SHOP - Système de Ticket")
      .setDescription("Clique sur le sélecteur ci-dessous pour créer un ticket !");

    const menu = new StringSelectMenuBuilder()
      .setCustomId("ticket_create")
      .setPlaceholder("Choisis un type de ticket")
      .addOptions([
        { label: "Recrutement", value: "recrutement" },
        { label: "Signalement", value: "signalement" },
        { label: "Remboursement", value: "remboursement" },
        { label: "Demande script", value: "demande_script" },
        { label: "Demande", value: "demande" }
      ]);

    const row = new ActionRowBuilder().addComponents(menu);

    return message.channel.send({ embeds: [embed], components: [row] });
  }
});

// =========================
// INTERACTIONS
// =========================
client.on("interactionCreate", async (interaction) => {
  // -------- HELP --------
  if (interaction.isButton() && interaction.customId.startsWith("help_")) {
    const embed = new EmbedBuilder().setColor("Blue");

    if (interaction.customId === "help_utilitaire") {
      embed.setTitle("🧰 Utilitaire").setDescription(
        [
          "`!help` — Affiche ce menu",
          "`!ping` — Latence du bot",
          "`!config` — Ouvre le dashboard",
          "`!ticket` — Panel de création de tickets",
          "`!say` — Faire parler le bot"
        ].join("\n")
      );
    }

    if (interaction.customId === "help_tickets") {
      embed.setTitle("🎫 Tickets").setDescription(
        [
          "`!ticket` — Ouvrir le panel",
          "",
          "Types disponibles :",
          "• Recrutement",
          "• Signalement",
          "• Remboursement",
          "• Demande script",
          "• Demande"
        ].join("\n")
      );
    }

    if (interaction.customId === "help_moderation") {
      embed.setTitle("🛠️ Modération").setDescription(
        [
          "`!ban` / `!unban`",
          "`!mute` / `!unmute`",
          "`!warn` / `!infractions`"
        ].join("\n")
      );
    }

    if (interaction.customId === "help_autres") {
      embed.setTitle("📦 Autres systèmes").setDescription(
        [
          "Économie, XP, anti-raid, anti-spam…",
          "On pourra les ajouter ensuite."
        ].join("\n")
      );
    }

    return interaction.update({ embeds: [embed] });
  }

  // =========================
  // CRÉATION DES TICKETS
  // =========================
  if (interaction.isStringSelectMenu() && interaction.customId === "ticket_create") {
    const type = interaction.values[0];
    const categoryId = config.ticketTypes[type];

    if (!categoryId)
      return interaction.reply({ content: "❌ Type de ticket non configuré.", ephemeral: true });

    // 🔥 FIX : empêcher la fermeture instantanée
    const channel = await interaction.guild.channels.create({
      name: `ticket-${type}-${interaction.user.username}`,
      type: 0,
      parent: categoryId,
      permissionOverwrites: [
        { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel] }
      ]
    });

    const embed = new EmbedBuilder()
      .setColor("Green")
      .setTitle("🎫 Ticket ouvert")
      .setDescription(
        [
          `Type : **${type}**`,
          `Utilisateur : ${interaction.user}`,
          "",
          "Un staff va bientôt te répondre."
        ].join("\n")
      );

    const closeRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket_close_${channel.id}`) // 🔥 ID UNIQUE PAR TICKET
        .setLabel("Fermer")
        .setStyle(ButtonStyle.Danger)
    );

    await channel.send({ content: `${interaction.user}`, embeds: [embed], components: [closeRow] });

    return interaction.reply({
      content: `🎫 Ton ticket a été ouvert : ${channel}`,
      ephemeral: true
    });
  }

  // =========================
  // FERMETURE DU TICKET
  // =========================
  if (interaction.isButton() && interaction.customId.startsWith("ticket_close_")) {
    const channel = interaction.channel;

    await interaction.reply("🔒 Ticket fermé. Suppression dans 5 secondes…");
    setTimeout(() => channel.delete().catch(() => {}), 5000);
  }
});

// =========================
// LOGIN
// =========================
client.login(process.env.TOKEN);
