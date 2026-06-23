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

const prefix = config.prefix;

// =========================
// CLIENT
// =========================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User]
});

client.once("ready", () => {
  console.log(`🔥 Bot connecté : ${client.user.tag}`);
});

// =========================
// COMMANDES TEXTE
// =========================
client.on("messageCreate", async (message) => {
  if (!message.guild || message.author.bot) return;
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/g);
  const cmd = args.shift()?.toLowerCase();

  // !say
  if (cmd === "say") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return message.reply("❌ Tu dois être admin pour utiliser cette commande.");

    const text = args.join(" ");
    if (!text) return message.reply("❌ Tu dois écrire un message.");

    await message.delete().catch(() => {});
    return message.channel.send(text);
  }

  // !help
  if (cmd === "help") {
    const embed = new EmbedBuilder()
      .setColor("Blue")
      .setTitle("📜 Menu d'aide — ObliShopProtect")
      .setDescription(
        [
          "**Utilitaire :**",
          "`!help` — Affiche ce menu",
          "`!say` — Faire parler le bot",
          "",
          "**Tickets :**",
          "`!ticket` — Ouvrir le panel de tickets`"
        ].join("\n")
      )
      .setFooter({ text: "Help Premium" });

    return message.channel.send({ embeds: [embed] });
  }

  // !ticket
  if (cmd === "ticket") {
    const embed = new EmbedBuilder()
      .setColor("Green")
      .setTitle("🎫 Obli Shop — Système de Ticket")
      .setDescription("Choisis un type de ticket ci-dessous pour commencer.\n\nTu recevras un **MP** pour décrire ta demande.");

    const menu = new StringSelectMenuBuilder()
      .setCustomId("ticket_type_select")
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
  // =========================
  // SÉLECTEUR DE TYPE DE TICKET
  // =========================
  if (interaction.isStringSelectMenu() && interaction.customId === "ticket_type_select") {
    const type = interaction.values[0];
    const categoryId = config.ticketTypes[type];

    if (!categoryId)
      return interaction.reply({ content: "❌ Ce type de ticket n'est pas configuré.", ephemeral: true });

    // On tente d'ouvrir les MP
    let dm;
    try {
      dm = await interaction.user.createDM();
    } catch {
      return interaction.reply({
        content: "❌ Je ne peux pas t'envoyer de message privé. Active tes MP pour ce serveur.",
        ephemeral: true
      });
    }

    await interaction.reply({
      content: "📩 Je t'ai envoyé un message privé pour compléter ton ticket.",
      ephemeral: true
    });

    // Demande de la question en MP
    await dm.send({
      embeds: [
        new EmbedBuilder()
          .setColor("Green")
          .setTitle("🎫 Obli Shop — Création de ticket")
          .setDescription(
            [
              `Type de ticket sélectionné : **${type}**`,
              "",
              "✏️ Merci d'écrire maintenant **l'objet de ta demande**.",
              "Tu as 2 minutes pour répondre."
            ].join("\n")
          )
      ]
    });

    const dmChannel = dm;
    const filterMsg = (m) => m.author.id === interaction.user.id;
    let question;

    try {
      const collected = await dmChannel.awaitMessages({
        filter: filterMsg,
        max: 1,
        time: 120000,
        errors: ["time"]
      });
      question = collected.first().content;
    } catch {
      return dmChannel.send("⏰ Temps écoulé. Tu peux recommencer la procédure avec `!ticket`.");
    }

    // Demande de confirmation
    const confirmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("ticket_confirm_yes").setLabel("✅ Confirmer").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("ticket_confirm_no").setLabel("❌ Annuler").setStyle(ButtonStyle.Danger)
    );

    const confirmMsg = await dmChannel.send({
      embeds: [
        new EmbedBuilder()
          .setColor("Yellow")
          .setTitle("✅ Confirmation de ticket")
          .setDescription(
            [
              `Type : **${type}**`,
              "",
              "**Ta demande :**",
              `> ${question}`,
              "",
              "Veux-tu ouvrir ce ticket ?"
            ].join("\n")
          )
      ],
      components: [confirmRow]
    });

    const filterBtn = (i) =>
      i.user.id === interaction.user.id &&
      (i.customId === "ticket_confirm_yes" || i.customId === "ticket_confirm_no");

    let confirmed = false;

    try {
      const btnInteraction = await confirmMsg.awaitMessageComponent({
        filter: filterBtn,
        time: 120000
      });

      if (btnInteraction.customId === "ticket_confirm_no") {
        confirmed = false;
        await btnInteraction.update({
          content: "❌ Ticket annulé.",
          embeds: [],
          components: []
        });
        return;
      } else if (btnInteraction.customId === "ticket_confirm_yes") {
        confirmed = true;
        await btnInteraction.update({
          content: "✅ Ticket confirmé, je le crée sur le serveur.",
          embeds: [],
          components: []
        });
      }
    } catch {
      return dmChannel.send("⏰ Temps écoulé. Ticket annulé.");
    }

    if (!confirmed) return;

    // Création du ticket sur le serveur
    const guild = interaction.guild;
    if (!guild) return;

    const ticketChannel = await guild.channels.create({
      name: `ticket-${type}-${interaction.user.username}`,
      type: 0,
      parent: categoryId,
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [PermissionsBitField.Flags.ViewChannel]
        },
        {
          id: interaction.user.id,
          allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]
        }
      ]
    });

    const now = new Date();
    const dateStr = now.toLocaleString("fr-FR", { timeZone: "Europe/Paris" });

    const ticketEmbed = new EmbedBuilder()
      .setColor("Green")
      .setTitle("🎫 Obli Shop — Système de Ticket")
      .addFields(
        {
          name: "👤 Créateur",
          value: `${interaction.user} (${interaction.user.id})`,
          inline: false
        },
        {
          name: "📂 Type de ticket",
          value: `\`${type}\``,
          inline: true
        },
        {
          name: "📌 Statut",
          value: "🟢 Ouvert",
          inline: true
        },
        {
          name: "🛠️ Staff assigné",
          value: "Aucun",
          inline: false
        },
        {
          name: "❓ Question",
          value: question || "Aucune question fournie.",
          inline: false
        },
        {
          name: "📅 Date d'ouverture",
          value: dateStr,
          inline: false
        }
      )
      .setFooter({ text: "ObliShopProtect — Système de tickets" });

    const buttonsRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket_claim_${ticketChannel.id}`)
        .setLabel("📌 Claim")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`ticket_close_${ticketChannel.id}`)
        .setLabel("🔒 Fermer")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`ticket_delete_${ticketChannel.id}`)
        .setLabel("🗑️ Supprimer")
        .setStyle(ButtonStyle.Danger)
    );

    await ticketChannel.send({
      content: `${interaction.user}`,
      embeds: [ticketEmbed],
      components: [buttonsRow]
    });

    await dmChannel.send(`🎫 Ton ticket a été créé sur Obli Shop : **#${ticketChannel.name}**.`);
    return;
  }

  // =========================
  // BOUTONS DANS LE TICKET
  // =========================
  if (interaction.isButton()) {
    const { customId } = interaction;

    // CLAIM
    if (customId.startsWith("ticket_claim_")) {
      const channelId = customId.split("ticket_claim_")[1];
      if (!interaction.channel || interaction.channel.id !== channelId)
        return interaction.reply({ content: "❌ Ce bouton n'est pas pour ce salon.", ephemeral: true });

      if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels))
        return interaction.reply({ content: "❌ Tu n'as pas la permission de claim ce ticket.", ephemeral: true });

      const msg = await interaction.channel.messages.fetch(interaction.message.id).catch(() => null);
      if (!msg) return;

      const embed = EmbedBuilder.from(msg.embeds[0]);
      const fields = embed.data.fields || [];

      // Mettre à jour statut + staff assigné
      const newFields = fields.map((f) => {
        if (f.name.startsWith("📌 Statut")) {
          return { ...f, value: "🟡 En cours" };
        }
        if (f.name.startsWith("🛠️ Staff assigné")) {
          return { ...f, value: `${interaction.user} (${interaction.user.id})` };
        }
        return f;
      });

      embed.setFields(newFields);

      await interaction.update({ embeds: [embed], components: interaction.message.components });
      return;
    }

    // FERMER
    if (customId.startsWith("ticket_close_")) {
      const channelId = customId.split("ticket_close_")[1];
      if (!interaction.channel || interaction.channel.id !== channelId)
        return interaction.reply({ content: "❌ Ce bouton n'est pas pour ce salon.", ephemeral: true });

      if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels))
        return interaction.reply({ content: "❌ Tu n'as pas la permission de fermer ce ticket.", ephemeral: true });

      const msg = await interaction.channel.messages.fetch(interaction.message.id).catch(() => null);
      if (!msg) return;

      const embed = EmbedBuilder.from(msg.embeds[0]);
      const fields = embed.data.fields || [];

      const newFields = fields.map((f) => {
        if (f.name.startsWith("📌 Statut")) {
          return { ...f, value: "🔴 Fermé" };
        }
        return f;
      });

      embed.setFields(newFields);

      await interaction.update({ embeds: [embed], components: interaction.message.components });
      return;
    }

    // SUPPRIMER
    if (customId.startsWith("ticket_delete_")) {
      const channelId = customId.split("ticket_delete_")[1];
      if (!interaction.channel || interaction.channel.id !== channelId)
        return interaction.reply({ content: "❌ Ce bouton n'est pas pour ce salon.", ephemeral: true });

      if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels))
        return interaction.reply({ content: "❌ Tu n'as pas la permission de supprimer ce ticket.", ephemeral: true });

      await interaction.reply("🗑️ Suppression du ticket dans 5 secondes…");
      setTimeout(() => {
        interaction.channel.delete().catch(() => {});
      }, 5000);
      return;
    }
  }
});

// =========================
// LOGIN
// =========================
client.login(process.env.TOKEN);
