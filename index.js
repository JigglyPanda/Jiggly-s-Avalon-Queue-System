// index.js - Main bot file
const { Client, GatewayIntentBits, Partials, Events, Collection, REST, Routes, EmbedBuilder, 
  ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, 
  TextInputBuilder, TextInputStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { formatTimezone, parseTimeRange, getCurrentTime, isTimeExpired, formatTime, 
  getCurrentDateTimeWithTZ, getRecognizedTimeZones } = require('./utils/timeUtils');

// Debug mode flag
let DEBUG_MODE = false;

// Initialize client with required intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Channel, Partials.Message]
});

// Server-specific queue management system
const serverQueues = {};

// Track user ephemeral messages
const userEphemeralMessages = {};

// Track channel messages per queue type (for cleanup)
const channelMessages = {};

// Function to initialize queues for a new server
function getServerQueues(guildId) {
  // If this server doesn't have queues initialized yet, create them
  if (!serverQueues[guildId]) {
    serverQueues[guildId] = {
      '10p': { players: [], requiredPlayers: 10 },
      '9p': { players: [], requiredPlayers: 9 },
      '8p': { players: [], requiredPlayers: 8 },
      '7p': { players: [], requiredPlayers: 7 },
      '6p': { players: [], requiredPlayers: 6 },
      '5p': { players: [], requiredPlayers: 5 },
    };
  }
  return serverQueues[guildId];
}

// Confirmation tracking for game readiness - server-specific
const pendingConfirmations = new Map();

// Dynamic announcement messages - EXPANDED for more personality
const announceJoinMessages = [
  "{player} has joined the {queue} queue! {current}/{required} players - {remaining} more needed! 🎮",
  "Welcome, {player}, to the {queue} resistance! {current}/{required} assembled - Need {remaining} more brave souls! 🕵️",
  "Agent {player} has infiltrated the {queue} queue! {current}/{required} operatives ready - {remaining} more required! 🔍",
  "{player} stands with the resistance in the {queue} queue! {current}/{required} members - Recruiting {remaining} more! ✊",
  "The {queue} mission has a new recruit: {player}! {current}/{required} agents - {remaining} positions open! 🚀",
  "{player} joins the {queue} battle! {current}/{required} warriors ready - {remaining} more needed for the mission! ⚔️",
  "A new challenger, {player}, enters the {queue} arena! {current}/{required} contestants - Just {remaining} more! 🏆",
  "The {queue} resistance welcomes {player}! {current}/{required} rebels assembled - Calling {remaining} more! 🌟",
  "Agent {player} reporting for {queue} duty! {current}/{required} squad members - Seeking {remaining} more! 🛡️",
  "{player} has answered the {queue} call! {current}/{required} heroes ready - {remaining} slots remain! 💫",
  "Spy hunter {player} joins the {queue} lobby! {current}/{required} detectives - Need {remaining} more sleuths! 🔎",
  "Freedom fighter {player} enlists in the {queue} resistance! {current}/{required} ready - {remaining} more needed! 🌠",
  "{player} has taken the {queue} oath! {current}/{required} committed - {remaining} spots left! 📜✨",
  "Operative {player} joins the {queue} conspiracy! {current}/{required} infiltrators - {remaining} vacancies remain! 🎭",
  "The legendary {player} graces the {queue} queue! {current}/{required} legends assembled - {remaining} more legends needed! 👑",
  "Epic strategist {player} enters the {queue} battlefield! {current}/{required} tacticians - {remaining} more required! 🧠",
  "{player} sneaks into the {queue} shadows! {current}/{required} agents in position - {remaining} more needed! 🥷",
  "A wild {player} appears in the {queue} queue! {current}/{required} players caught - {remaining} more to catch! 🎯",
  "The mysterious {player} materializes in the {queue} lobby! {current}/{required} enigmas present - {remaining} more sought! 🔮",
  "{player} has boarded the {queue} mission! {current}/{required} crew members - {remaining} seats remain! 🚀"
];

// Messages for when players leave due to expired time
const timeExpiredMessages = [
  "{player} had to dash! Their available time window closed. Removed from {queue} queue. {current}/{required} players remaining. 🏃‍♂️💨",
  "{player}'s secret mission elsewhere has begun! They've been extracted from the {queue} queue. {current}/{required} players left. ⏰",
  "Agent {player} has been recalled from the {queue} mission - time availability expired! {current}/{required} operatives remain. 🕒",
  "{player}'s time window has closed. They've been whisked away from the {queue} queue! Down to {current}/{required} agents. ⌛",
  "Time's up for {player}! Their availability period ended, so they've left the {queue} queue. {current}/{required} revolutionaries remain. ⏱️",
  "{player} has other responsibilities calling! Removed from {queue} queue as their time expired. {current}/{required} fighters left. 📱",
  "The clock strikes the hour, and {player} must depart the {queue} queue! Their window of availability has ended. {current}/{required} players now. 🕰️",
  "{player} vanished when their available time ran out! No longer in the {queue} queue. {current}/{required} resisters remain. 🧙‍♂️",
  "Reality calls {player} away from the {queue} queue as their availability window closes. {current}/{required} agents ready. 📆",
  "The {queue} mission will continue without {player} - their available time has expired. {current}/{required} members stand ready. 🚶‍♀️"
];

// Messages for when players leave manually
const leaveQueueMessages = [
  "{player} has left the {queue} queue. Currently {current}/{required} players. 👋",
  "{player} bids farewell to the {queue} resistance. {current}/{required} remain. 🚶‍♀️",
  "Agent {player} has been extracted from the {queue} mission! {current}/{required} operatives remain. 🪂",
  "{player} must attend to other matters. They've left the {queue} queue. {current}/{required} still waiting. 📱",
  "The {queue} team will have to continue without {player}. Currently at {current}/{required} members. 🏳️",
  "{player} has abandoned the {queue} mission! Down to {current}/{required} agents. 🚪",
  "One less rebel as {player} leaves the {queue} queue. Currently {current}/{required} revolutionaries. 💔",
  "{player} vanishes from the {queue} queue! {current}/{required} players remain. 💨",
  "The {queue} lobby loses {player}. Down to {current}/{required} resistance fighters. 📉",
  "Agent {player} has gone dark. Removed from queue {queue}. {current}/{required} agents active. 🌑"
];

// Track ephemeral messages per user to manage dismissal
function trackEphemeralMessage(userId, message) {
  if (!userEphemeralMessages[userId]) {
    userEphemeralMessages[userId] = [];
  }
  
  userEphemeralMessages[userId].push({
    message,
    timestamp: Date.now()
  });
  
  // Keep only the latest 2 messages, mark others as outdated
  if (userEphemeralMessages[userId].length > 2) {
    // Get older messages to update (all except the last 2)
    const oldMessages = userEphemeralMessages[userId].slice(0, -2);
    userEphemeralMessages[userId] = userEphemeralMessages[userId].slice(-2);
    
    // Process older messages with the same 20 second delay we use for channel messages
    for (const oldMsg of oldMessages) {
      const now = Date.now();
      const messageAge = now - oldMsg.timestamp;
      const messageToUpdate = oldMsg.message; // Store reference to message
      
      // Only update if message is at least 20 seconds old
      if (messageAge >= 20000) { // 20 seconds in milliseconds
        try {
          if (messageToUpdate && messageToUpdate.edit) {
            messageToUpdate.edit({
              content: "ㅤ", // Using an invisible Unicode character
              components: [],
              embeds: []
            }).catch(e => console.log("Failed to update old message: ", e.message));
          }
        } catch (error) {
          console.log("Error updating old message: ", error.message);
        }
      } else {
        // If message is too new, schedule update after it reaches 20 seconds
        const timeToWait = 20000 - messageAge;
        setTimeout(() => {
          try {
            if (messageToUpdate && messageToUpdate.edit) {
              messageToUpdate.edit({
                content: "ㅤ", // Using an invisible Unicode character
                components: [],
                embeds: []
              }).catch(e => console.log("Failed to update scheduled message: ", e.message));
            }
          } catch (error) {
            console.log("Error updating scheduled message: ", error.message);
          }
        }, timeToWait);
      }
    }
  }
  
  return message;
}

// Helper function to send ephemeral messages with tracking
async function sendTrackedEphemeral(interaction, content, options = {}) {
  try {
    let response;
    
    if (interaction.replied || interaction.deferred) {
      response = await interaction.followUp({
        ...options,
        content,
        ephemeral: true
      });
    } else {
      response = await interaction.reply({
        ...options,
        content,
        ephemeral: true
      });
    }
    
    // Track this message for the user
    trackEphemeralMessage(interaction.user.id, {
      edit: async (newContent) => {
        try {
          await interaction.editReply(newContent);
        } catch (error) {
          console.error("Failed to edit reply:", error);
        }
      }
    });
    
    return response;
  } catch (error) {
    console.error("Error sending tracked ephemeral:", error);
    return null;
  }
}

// Event handler to process commands when the bot is ready
client.once(Events.ClientReady, () => {
  console.log(`Logged in as ${client.user.tag}`);
  registerCommands();

  // Start interval to check for expired time windows
  setInterval(checkExpiredTimeWindows, 30 * 1000); // Check every 30 seconds
});

// Command registration
async function registerCommands() {
  try {
    const commands = [
      {
        name: 'avalon',
        description: 'Start the ProAvalon queue system',
      },
      {
        name: 'leave-queue',
        description: 'Leave the ProAvalon queue',
        options: [
          {
            name: 'queue',
            description: 'Specific queue to leave (leave all if not specified)',
            type: 3, // STRING type
            required: false,
            choices: [
              { name: '5 Players', value: '5p' },
              { name: '6 Players', value: '6p' },
              { name: '7 Players', value: '7p' },
              { name: '8 Players', value: '8p' },
              { name: '9 Players', value: '9p' },
              { name: '10 Players', value: '10p' },
              { name: 'All Queues', value: 'all' }
            ]
          }
        ]
      },
      {
        name: 'queue-status',
        description: 'Check the status of all ProAvalon queues',
      },
      {
        name: 'debug-mode',
        description: 'Toggle debug mode for testing (Admin only)',
        options: [
          {
            name: 'mode',
            description: 'Turn debug mode on or off',
            type: 3, // STRING type
            required: true,
            choices: [
              {
                name: 'On',
                value: 'on'
              },
              {
                name: 'Off',
                value: 'off'
              }
            ]
          }
        ]
      },
      {
        name: 'debug-fill',
        description: 'Fill a queue for testing (Debug mode only)',
        options: [
          {
            name: 'queue',
            description: 'Queue to fill',
            type: 3, // STRING type
            required: true,
            choices: [
              { name: '5 Players', value: '5p' },
              { name: '6 Players', value: '6p' },
              { name: '7 Players', value: '7p' },
              { name: '8 Players', value: '8p' },
              { name: '9 Players', value: '9p' },
              { name: '10 Players', value: '10p' }
            ]
          }
        ]
      }
    ];

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    console.log('Started refreshing application commands.');

    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands },
    );

    console.log('Successfully reloaded application commands.');
  } catch (error) {
    console.error(error);
  }
}

// Check for expired time windows across all servers and queues
function checkExpiredTimeWindows() {
  try {
    const now = new Date();
    console.log(`Checking for expired time windows at ${getCurrentDateTimeWithTZ()}`);
    let expiredPlayers = [];

    // Loop through each server
    for (const [guildId, guildQueues] of Object.entries(serverQueues)) {
      // Check all queues for this server
      for (const [queueType, queueData] of Object.entries(guildQueues)) {
        const playersToRemove = [];

        // Find players with expired time windows
        for (let i = 0; i < queueData.players.length; i++) {
          const player = queueData.players[i];
          if (player.timeRange) {
            const expired = isTimeExpired(player.timeRange.end, now);
            console.log(`Server ${guildId} - Player ${player.username} in ${queueType} queue - Time range: ${player.timeRange.start} to ${player.timeRange.end}, Expired: ${expired}`);
            
            if (expired) {
              playersToRemove.push({ player, index: i });
            }
          }
        }

        // Remove players with expired time windows (in reverse to avoid index issues)
        for (let i = playersToRemove.length - 1; i >= 0; i--) {
          const { player, index } = playersToRemove[i];
          queueData.players.splice(index, 1);
          expiredPlayers.push({ player, queueType, guildId });
          console.log(`Server ${guildId} - Player ${player.username} removed from ${queueType} queue due to expired time window`);
        }
      }
    }

    // Announce removed players
    if (expiredPlayers.length > 0) {
      announceExpiredPlayers(expiredPlayers);
    }
  } catch (error) {
    console.error('Error in checkExpiredTimeWindows:', error);
  }
}

// Announce players who were removed due to expired time windows
async function announceExpiredPlayers(expiredPlayers) {
  for (const { player, queueType, guildId } of expiredPlayers) {
    try {
      // First try to use the player's own channel if available
      let channel = player.channel;

      // If no channel found, try to find one from pending confirmations for this server
      if (!channel) {
        for (const [confirmKey, confirmationData] of pendingConfirmations.entries()) {
          if (confirmKey.startsWith(`${guildId}-`) && confirmationData.channel) {
            channel = confirmationData.channel;
            break;
          }
        }
      }

      // If we still don't have a channel, log and continue
      if (!channel) {
        console.log(`Server ${guildId} - Player ${player.username} removed from ${queueType} queue due to expired time window, but no channel found to announce`);
        continue;
      }

      // Get current queue information for the message
      const serverQueue = getServerQueues(guildId);
      const queue = serverQueue[queueType];
      const currentPlayers = queue.players.length;
      const requiredPlayers = queue.requiredPlayers;

      // Select a random message and announce
      const messageTemplate = timeExpiredMessages[Math.floor(Math.random() * timeExpiredMessages.length)];

      const message = messageTemplate
        .replace('{player}', player.username)
        .replace('{queue}', queueType)
        .replace('{current}', currentPlayers)
        .replace('{required}', requiredPlayers);

      const sentMessage = await channel.send(message);
      
      // Track this message for cleanup
      await trackChannelMessage(channel.id, queueType, sentMessage);
    } catch (error) {
      console.error(`Error announcing expired player ${player.username}:`, error);
    }
  }
}

// Interaction handler
client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isCommand()) {
      // Handle slash commands
      if (interaction.commandName === 'avalon') {
        await handleAvalonCommand(interaction);
      } else if (interaction.commandName === 'leave-queue') {
        await handleLeaveQueue(interaction);
      } else if (interaction.commandName === 'queue-status') {
        await handleQueueStatus(interaction);
      } else if (interaction.commandName === 'debug-mode') {
        await handleDebugMode(interaction);
      } else if (interaction.commandName === 'debug-fill') {
        await handleDebugFill(interaction);
      }
    } else if (interaction.isButton()) {
      // Handle button interactions
      await handleButtonInteraction(interaction);
    } else if (interaction.isStringSelectMenu()) {
      // Handle select menu interactions
      await handleSelectMenuInteraction(interaction);
    } else if (interaction.isModalSubmit()) {
      // Handle modal submissions
      await handleModalSubmit(interaction);
    }
  } catch (error) {
    console.error('Error handling interaction:', error);
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ 
          content: 'There was an error processing your request.', 
          ephemeral: true
        });
      } else {
        await interaction.reply({ 
          content: 'There was an error processing your request.', 
          ephemeral: true
        });
      }
    } catch (e) {
      console.error('Error sending error message:', e);
    }
  }
});

// Handle debug mode command
async function handleDebugMode(interaction) {
  try {
    // Check if user has admin permissions
    if (!interaction.member.permissions.has('ADMINISTRATOR')) {
      await sendTrackedEphemeral(interaction, 'You need administrator permissions to use this command.');
      return;
    }

    const mode = interaction.options.getString('mode');
    DEBUG_MODE = mode === 'on';

    await sendTrackedEphemeral(interaction, `Debug mode has been turned ${DEBUG_MODE ? 'ON' : 'OFF'}.`);
  } catch (error) {
    console.error('Error in handleDebugMode:', error);
    await sendTrackedEphemeral(interaction, 'There was an error processing your request.');
  }
}

// Handle debug fill command
async function handleDebugFill(interaction) {
  try {
    // Check if debug mode is on
    if (!DEBUG_MODE) {
      await sendTrackedEphemeral(interaction, 'Debug mode is not active. Use /debug-mode on to enable it first.');
      return;
    }

    const queueType = interaction.options.getString('queue');
    const guildId = interaction.guild.id;
    const serverQueue = getServerQueues(guildId);
    const queue = serverQueue[queueType];

    // Clear any existing players
    queue.players = [];

    // Add the command user as the first player
    queue.players.push({
      userId: interaction.user.id,
      username: interaction.user.username,
      joinedAt: new Date(),
      channel: interaction.channel, // Store the channel for announcements
      guildId: interaction.guild.id // Store the guild ID
    });

    // Add fake players to almost fill the queue
    const botsNeeded = queue.requiredPlayers - 1; // -1 because we already added the user

    for (let i = 0; i < botsNeeded; i++) {
      queue.players.push({
        userId: `debug-bot-${i}`,
        username: `DebugBot${i+1}`,
        joinedAt: new Date(),
        channel: interaction.channel,
        guildId: interaction.guild.id // Store the guild ID
      });
    }

    await sendTrackedEphemeral(interaction, `Debug: Filled ${queueType} queue with ${botsNeeded} bots plus you. Total: ${queue.players.length}/${queue.requiredPlayers} players.`);

    // Announce in channel
    await announcePlayerJoin(interaction.channel, interaction.user, queueType, guildId);

    // Check queue status (will trigger game start since queue is full)
    checkQueueStatus(queueType, interaction.channel, guildId);
  } catch (error) {
    console.error('Error in handleDebugFill:', error);
    await sendTrackedEphemeral(interaction, 'There was an error processing your request.');
  }
}

// Handle /avalon command
async function handleAvalonCommand(interaction) {
  try {
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('ProAvalon: The Resistance')
      .setDescription('Select the number of players for your game:')
      .setFooter({ text: 'Join the resistance and overthrow the spies!' });

    const row = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('player-count')
          .setPlaceholder('Select player count')
          .addOptions([
            { label: '10 Players', value: '10p', description: 'Queue for a 10-player game' },
            { label: '9 Players', value: '9p', description: 'Queue for a 9-player game' },
            { label: '8 Players', value: '8p', description: 'Queue for a 8-player game' },
            { label: '7 Players', value: '7p', description: 'Queue for a 7-player game' },
            { label: '6 Players', value: '6p', description: 'Queue for a 6-player game' },
            { label: '5 Players', value: '5p', description: 'Queue for a 5-player game' },
          ]),
      );

    const response = await interaction.reply({ 
      embeds: [embed], 
      components: [row], 
      ephemeral: true
    });
    
    // Track this message
    trackEphemeralMessage(interaction.user.id, {
      edit: async (newContent) => {
        try {
          await interaction.editReply(newContent);
        } catch (error) {
          console.error("Failed to edit reply:", error);
        }
      }
    });

    // Create a simple timezone info message
    const now = new Date();
    const timeInfo = `**Current server time:** ${getCurrentDateTimeWithTZ()}\n\n` +
                    `When specifying time, you can add time zone (e.g., "now-8:30pm EST" or "now-1:04 PST")`;

    // Send timezone info in a follow-up message
    const followUp = await interaction.followUp({
      content: timeInfo,
      ephemeral: true
    });
    
    // Track follow-up
    trackEphemeralMessage(interaction.user.id, {
      edit: async (newContent) => {
        try {
          await interaction.editReply(newContent);
        } catch (error) {
          console.error("Failed to edit follow-up:", error);
        }
      }
    });
  } catch (error) {
    console.error('Error in handleAvalonCommand:', error);
    await sendTrackedEphemeral(interaction, 'There was an error processing your command. Please try again.');
  }
}

// Handle player count selection
async function handleSelectMenuInteraction(interaction) {
  try {
    if (interaction.customId === 'player-count') {
      const selectedQueue = interaction.values[0];

      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`join-now-${selectedQueue}`)
            .setLabel('Join Now')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`specify-time-${selectedQueue}`)
            .setLabel('Specify Available Time')
            .setStyle(ButtonStyle.Secondary),
        );

      const response = await interaction.update({ 
        content: `You selected: ${selectedQueue} queue. Would you like to join now or specify your available time range?`,
        embeds: [], 
        components: [row]
      });
      
      // Track this message update
      trackEphemeralMessage(interaction.user.id, {
        edit: async (newContent) => {
          try {
            await interaction.editReply(newContent);
          } catch (error) {
            console.error("Failed to edit reply:", error);
          }
        }
      });
    }
  } catch (error) {
    console.error('Error in handleSelectMenuInteraction:', error);
    await sendTrackedEphemeral(interaction, 'There was an error processing your selection. Please try again.');
  }
}

// Handle button interaction from DM
async function handleButtonInteraction(interaction) {
  try {
    const customId = interaction.customId;
    console.log(`Button interaction: ${customId}`);

    if (customId.startsWith('join-now-')) {
      const queueType = customId.split('-')[2];
      await handleJoinNow(interaction, queueType);
    } 
    else if (customId.startsWith('specify-time-')) {
      const queueType = customId.split('-')[2];
      await showTimeModal(interaction, queueType);
    }
    else if (customId.startsWith('leave-queue')) {
      await handleLeaveQueueButton(interaction);
    }
    else if (customId.startsWith('confirm-game-')) {
      const parts = customId.split('-');
      const queueType = parts[2];
      const guildId = parts.length > 3 ? parts[3] : null; // Extract guild ID if present
      
      console.log(`Confirm game: queueType=${queueType}, guildId=${guildId}`);
      await handleGameConfirmation(interaction, queueType, true, guildId);
    }
    else if (customId.startsWith('decline-game-')) {
      const parts = customId.split('-');
      const queueType = parts[2];
      const guildId = parts.length > 3 ? parts[3] : null; // Extract guild ID if present
      
      console.log(`Decline game: queueType=${queueType}, guildId=${guildId}`);
      await handleGameConfirmation(interaction, queueType, false, guildId);
    }
    else if (customId.startsWith('join-queue-')) {
      const queueType = customId.split('-')[2];
      await handleJoinQueueFromButton(interaction, queueType);
    }
  } catch (error) {
    console.error('Error in handleButtonInteraction:', error);
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ 
          content: 'There was an error processing your request. Please try again.',
          ephemeral: true
        });
      } else {
        await interaction.reply({ 
          content: 'There was an error processing your button click. Please try again.',
          ephemeral: true
        });
      }
    } catch (err) {
      console.error('Error sending error message:', err);
    }
  }
}

// Handle joining queue from announcement button
async function handleJoinQueueFromButton(interaction, queueType) {
  try {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    const serverQueue = getServerQueues(guildId);
    const queue = serverQueue[queueType];

    // Check if player is already in this specific queue
    const isInQueue = queue.players.some(p => p.userId === userId);
    
    if (isInQueue) {
      await sendTrackedEphemeral(interaction, `You are already in the ${queueType} queue.`);
      return;
    }

    // Show the user options similar to /avalon command result but for this specific queue
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`join-now-${queueType}`)
          .setLabel('Join Now')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`specify-time-${queueType}`)
          .setLabel('Specify Available Time')
          .setStyle(ButtonStyle.Secondary),
      );

    await sendTrackedEphemeral(interaction, 
      `Would you like to join the ${queueType} queue now or specify your available time range?`,
      { components: [row] }
    );
  } catch (error) {
    console.error('Error in handleJoinQueueFromButton:', error);
    await sendTrackedEphemeral(interaction, 'There was an error processing your request. Please try again.');
  }
}

// Show time range modal
async function showTimeModal(interaction, queueType) {
  try {
    const modal = new ModalBuilder()
      .setCustomId(`time-modal-${queueType}`)
      .setTitle('Specify Your Available Time');

    const timeInput = new TextInputBuilder()
      .setCustomId('time-range')
      .setLabel('Time Range')
      .setPlaceholder('Examples: now-8:30pm, 6:00-9:30 PST, now-1:04 EST')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const row = new ActionRowBuilder().addComponents(timeInput);
    modal.addComponents(row);

    await interaction.showModal(modal);
  } catch (error) {
    console.error('Error in showTimeModal:', error);
    await sendTrackedEphemeral(interaction, 'There was an error showing the time selection. Please try again.');
  }
}

// Handle modal submit
async function handleModalSubmit(interaction) {
  try {
    if (interaction.customId.startsWith('time-modal-')) {
      const queueType = interaction.customId.split('-')[2];
      const timeRange = interaction.fields.getTextInputValue('time-range');

      try {
        const parsedRange = parseTimeRange(timeRange);
        await addPlayerToQueue(interaction, queueType, parsedRange);
      } catch (error) {
        await sendTrackedEphemeral(interaction, 
          `Error parsing time range: ${error.message}. Please use formats like "now-8:30pm", "6:00-9:30 PST", or "now-1:04 EST".`
        );
      }
    }
  } catch (error) {
    console.error('Error in handleModalSubmit:', error);
    await sendTrackedEphemeral(interaction, 'There was an error processing your time selection. Please try again.');
  }
}

// Join queue immediately
async function handleJoinNow(interaction, queueType) {
  try {
    await addPlayerToQueue(interaction, queueType);
  } catch (error) {
    console.error('Error in handleJoinNow:', error);
    await sendTrackedEphemeral(interaction, 'There was an error joining the queue. Please try again.');
  }
}

// Add player to queue
async function addPlayerToQueue(interaction, queueType, timeRange = null) {
  try {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    const serverQueue = getServerQueues(guildId);
    const queue = serverQueue[queueType];

    // Check if player is already in this specific queue type
    const existingPlayer = queue.players.find(p => p.userId === userId);
    if (existingPlayer) {
      await sendTrackedEphemeral(interaction, `You are already in the ${queueType} queue in this server.`);
      return;
    }

    // If timeRange provided, validate that it's not already expired
    if (timeRange) {
      const now = new Date();
      if (isTimeExpired(timeRange.end, now)) {
        await sendTrackedEphemeral(interaction, 
          `The time range you provided (until ${timeRange.end}) has already expired. Please provide a future time.`
        );
        return;
      }
    }

    // Add player to the queue with channel and server information
    const playerData = {
      userId,
      username: interaction.user.username,
      timeRange,
      joinedAt: new Date(),
      channel: interaction.channel, // Store the channel for announcements
      guildId: interaction.guild.id  // Store the guild ID
    };

    queue.players.push(playerData);

    // Create leave queue button
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`leave-queue-${queueType}`)
          .setLabel('Leave Queue')
          .setStyle(ButtonStyle.Danger),
      );

    // Reply to the user
    let replyMessage = `You have joined the ${queueType} queue`;
    if (timeRange) {
      replyMessage += ` with availability ${timeRange.start} to ${timeRange.end}`;
      if (timeRange.timezone && timeRange.timezone !== 'UTC') {
        replyMessage += ` (${timeRange.timezone})`;
      }
    }
    replyMessage += `! (Server time is ${getCurrentDateTimeWithTZ()})`;

    await sendTrackedEphemeral(interaction, replyMessage, { components: [row] });

    // Announce in channel
    await announcePlayerJoin(interaction.channel, interaction.user, queueType, guildId);

    // Check if queue is full
    checkQueueStatus(queueType, interaction.channel, guildId);
  } catch (error) {
    console.error('Error in addPlayerToQueue:', error);
    await sendTrackedEphemeral(interaction, 'There was an error adding you to the queue. Please try again.');
  }
}

// Leave queue
async function handleLeaveQueue(interaction) {
  try {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    const serverQueue = getServerQueues(guildId);
    let found = false;
    let message = '';
    
    // Check if a specific queue was specified
    const specifiedQueue = interaction.options.getString('queue');
    
    if (specifiedQueue && specifiedQueue !== 'all') {
      // Leave a specific queue
      const queueData = serverQueue[specifiedQueue];
      if (!queueData) {
        await sendTrackedEphemeral(interaction, `Queue type ${specifiedQueue} not found.`);
        return;
      }
      
      const playerIndex = queueData.players.findIndex(p => p.userId === userId);
      if (playerIndex !== -1) {
        const player = queueData.players[playerIndex];
        queueData.players.splice(playerIndex, 1);
        found = true;
        message = `You have left the ${specifiedQueue} queue.`;
        
        // Announce in channel
        await announcePlayerLeave(interaction.channel, interaction.user, specifiedQueue, guildId);
      } else {
        message = `You are not currently in the ${specifiedQueue} queue.`;
      }
    } else {
      // Leave all queues
      for (const [type, queueData] of Object.entries(serverQueue)) {
        const playerIndex = queueData.players.findIndex(p => p.userId === userId);
        if (playerIndex !== -1) {
          const player = queueData.players[playerIndex];
          queueData.players.splice(playerIndex, 1);
          found = true;
          
          // Announce in channel
          await announcePlayerLeave(interaction.channel, interaction.user, type, guildId);
        }
      }
      
      message = found ? `You have left all queues in this server.` : `You are not currently in any queue in this server.`;
    }

    await sendTrackedEphemeral(interaction, message);
  } catch (error) {
    console.error('Error in handleLeaveQueue:', error);
    await sendTrackedEphemeral(interaction, 'There was an error processing your request. Please try again.');
  }
}

// Announce player leaving queue
async function announcePlayerLeave(channel, user, queueType, guildId) {
  try {
    const serverQueue = getServerQueues(guildId);
    const queue = serverQueue[queueType];
    const currentPlayers = queue.players.length;
    const requiredPlayers = queue.requiredPlayers;

    // Select a random leave message
    const messageTemplate = leaveQueueMessages[Math.floor(Math.random() * leaveQueueMessages.length)];

    // Replace placeholders
    const message = messageTemplate
      .replace('{player}', user.username)
      .replace('{queue}', queueType)
      .replace('{current}', currentPlayers)
      .replace('{required}', requiredPlayers);

    const sentMessage = await channel.send(message);
    
    // Track the message for this queue type and clean up old ones
    await trackChannelMessage(channel.id, queueType, sentMessage);
  } catch (error) {
    console.error('Error in announcePlayerLeave:', error);
  }
}

// Handle leaving queue via button
async function handleLeaveQueueButton(interaction) {
  try {
    const queueType = interaction.customId.split('-')[2];
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    const serverQueue = getServerQueues(guildId);
    const queue = serverQueue[queueType];

    const playerIndex = queue.players.findIndex(p => p.userId === userId);
    if (playerIndex !== -1) {
      queue.players.splice(playerIndex, 1);
      await interaction.update({ 
        content: `You have left the ${queueType} queue.`,
        components: [],
      });

      // Announce in channel with a random leave message
      await announcePlayerLeave(interaction.channel, interaction.user, queueType, guildId);
    } else {
      await interaction.update({ 
        content: `You are no longer in the ${queueType} queue.`,
        components: [],
      });
    }
  } catch (error) {
    console.error('Error in handleLeaveQueueButton:', error);
    await sendTrackedEphemeral(interaction, 'There was an error processing your request. Please try again.');
  }
}

// Check queue status and notify if full
async function checkQueueStatus(queueType, channel, guildId) {
  try {
    const serverQueue = getServerQueues(guildId);
    const queue = serverQueue[queueType];

    if (queue.players.length >= queue.requiredPlayers) {
      // Get all players in the queue
      const players = queue.players.slice(0, queue.requiredPlayers);

      // Create a confirmation key that includes the server ID
      const confirmationKey = `${guildId}-${queueType}`;

      // Initialize confirmation tracking with server ID in the key
      pendingConfirmations.set(confirmationKey, {
        players: players.map(p => ({ ...p, confirmed: false })),
        channel,
        guildId // Store guild ID for reference
      });

      // Ping all players
      const mentions = players.map(p => p.userId.startsWith('debug-bot-') ? `${p.username} (Bot)` : `<@${p.userId}>`).join(' ');
      const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle(`Game Ready: ${queueType} ProAvalon`)
        .setDescription(`A game is ready to start! Please confirm if you're still available.\n\nPlayers: ${mentions}`)
        .setFooter({ text: 'You have 2 minutes to confirm' });

      const message = await channel.send({ content: mentions.includes('<@') ? mentions : '', embeds: [embed] });

      // Get the guild name for the DM
      let guildName = "Unknown Server";
      try {
        const guild = client.guilds.cache.get(guildId);
        if (guild) {
          guildName = guild.name;
        }
      } catch (err) {
        console.error("Error getting guild name:", err);
      }

      // Send confirmation requests to each player
      let allResponded = true;

      for (const player of players) {
        try {
          // Skip debug bots and auto-confirm them
          if (player.userId.startsWith('debug-bot-')) {
            markPlayerConfirmation(confirmationKey, player.userId, true);
            continue;
          }
          
          const user = await client.users.fetch(player.userId);
          const row = new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(`confirm-game-${queueType}-${guildId}`) // Include guild ID in button ID
                .setLabel('Confirm')
                .setStyle(ButtonStyle.Success),
              new ButtonBuilder()
                .setCustomId(`decline-game-${queueType}-${guildId}`) // Include guild ID in button ID
                .setLabel('Decline')
                .setStyle(ButtonStyle.Danger),
            );
            
          await user.send({ 
            content: `A ${queueType} ProAvalon game is ready to start in server "${guildName}"! Are you still available to play?`,
            components: [row],
          });
          allResponded = false;
        } catch (error) {
          console.error(`Failed to send DM to ${player.username}:`, error);
          // If DM fails, automatically remove them from confirmation
          markPlayerConfirmation(confirmationKey, player.userId, false);
        }
      }

      // If in debug mode and all players responded (because they're bots), check immediately
      if (DEBUG_MODE && allResponded) {
        checkConfirmations(confirmationKey);
      } else {
        // Set a timeout for confirmation (2 minutes)
        setTimeout(() => checkConfirmations(confirmationKey), 2 * 60 * 1000);
      }
    }
  } catch (error) {
    console.error('Error in checkQueueStatus:', error);
  }
}

// Handle game confirmation response
async function handleGameConfirmation(interaction, queueType, confirmed, explicitGuildId = null) {
  try {
    const userId = interaction.user.id;
    let guildId;
    
    // First try to use the explicitly passed guildId (from DM buttons)
    if (explicitGuildId) {
      guildId = explicitGuildId;
      console.log(`Using explicit guildId: ${guildId}`);
    }
    // Then try to extract guild ID from the custom ID if available (from DMs)
    else if (interaction.customId.split('-').length > 3) {
      guildId = interaction.customId.split('-')[3];
      console.log(`Extracted guildId from customId: ${guildId}`);
    }
    // Otherwise use the interaction's guild ID directly
    else if (interaction.guild) {
      guildId = interaction.guild.id;
      console.log(`Using interaction.guild.id: ${guildId}`);
    } else {
      // Last resort: look through all pending confirmations for this user
      console.log("Searching for user in all pending confirmations");
      for (const [key, data] of pendingConfirmations.entries()) {
        if (data.players.some(p => p.userId === userId)) {
          guildId = key.split('-')[0];
          console.log(`Found user in confirmation for guildId: ${guildId}`);
          break;
        }
      }
      
      if (!guildId) {
        console.error("Could not determine guild ID for confirmation");
        await interaction.update({
          content: "Error: Could not determine which server this confirmation is for. Please try again.",
          components: [],
        });
        return;
      }
    }

    const confirmationKey = `${guildId}-${queueType}`;
    console.log(`Using confirmation key: ${confirmationKey}`);

    // If confirmed, remove the player from all other queues
    if (confirmed) {
      const serverQueue = getServerQueues(guildId);
      
      // First, get the confirmation data which contains the channel
      const confirmationData = pendingConfirmations.get(confirmationKey);
      const confirmationChannel = confirmationData ? confirmationData.channel : null;
      
      for (const [type, queueData] of Object.entries(serverQueue)) {
        if (type !== queueType) { // Skip the queue they're confirming for
          const playerIndex = queueData.players.findIndex(p => p.userId === userId);
          if (playerIndex !== -1) {
            // Find a valid channel to announce in BEFORE removing the player
            let channel = null;
            
            // Try these channels in order of preference:
            // 1. The confirmation channel (from the queue that's starting)
            if (confirmationChannel) {
              channel = confirmationChannel;
            }
            
            // 2. The player's own channel before we remove them
            if (!channel && queueData.players[playerIndex].channel) {
              channel = queueData.players[playerIndex].channel;
            }
            
            // 3. Any other player's channel in this queue
            if (!channel) {
              const otherPlayer = queueData.players.find(p => p.userId !== userId && p.channel);
              if (otherPlayer) {
                channel = otherPlayer.channel;
              }
            }
            
            // 4. The interaction channel as last resort
            if (!channel && interaction.channel) {
              channel = interaction.channel;
            }
            
            // Create a proper player object for the announcement
            const playerObject = {
              userId: userId,
              username: interaction.user.username
            };
            
            // Now remove player from queue
            queueData.players.splice(playerIndex, 1);
            console.log(`Player ${userId} removed from queue ${type} after confirming ${queueType}`);
            
            // Announce leaving the other queues if we have a valid channel
            if (channel) {
              try {
                await announcePlayerLeave(channel, playerObject, type, guildId);
                console.log(`Announced player ${playerObject.username} leaving ${type} queue`);
              } catch (err) {
                console.error(`Error announcing queue leave after confirmation: ${err.message}`);
              }
            } else {
              console.log(`Could not find a channel to announce player leaving ${type} queue`);
            }
          }
        }
      }
    }

    // Mark the player's confirmation status
    markPlayerConfirmation(confirmationKey, userId, confirmed);

    await interaction.update({ 
      content: confirmed 
        ? `You have confirmed for the ${queueType} ProAvalon game! Please wait for all players to confirm. You have been removed from all other queues.`
        : `You have declined the ${queueType} ProAvalon game. You have been removed from the queue.`,
      components: [],
    });

    // Check if all players have responded
    const confirmationData = pendingConfirmations.get(confirmationKey);
    console.log(`Confirmation data found: ${!!confirmationData}`);
    
    if (confirmationData) {
      console.log(`Players responded: ${confirmationData.players.filter(p => p.responded).length}/${confirmationData.players.length}`);
      
      if (confirmationData.players.every(p => p.responded)) {
        console.log(`All players have responded, checking confirmations for ${confirmationKey}`);
        checkConfirmations(confirmationKey);
      }
    }
  } catch (error) {
    console.error('Error in handleGameConfirmation:', error);
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ 
          content: 'There was an error processing your confirmation. Please try again.',
          ephemeral: true
        });
      } else {
        await interaction.reply({ 
          content: 'There was an error processing your confirmation. Please try again.',
          ephemeral: true
        });
      }
    } catch (err) {
      console.error('Error sending error message:', err);
    }
  }
}

// Mark player confirmation
function markPlayerConfirmation(confirmationKey, userId, confirmed) {
  try {
    console.log(`Marking player ${userId} as ${confirmed ? 'confirmed' : 'declined'} for ${confirmationKey}`);
    
    const confirmationData = pendingConfirmations.get(confirmationKey);
    if (!confirmationData) {
      console.error(`No confirmation data found for key: ${confirmationKey}`);
      return;
    }

    // Extract guild ID and queue type from the confirmation key
    const [guildId, queueType] = confirmationKey.split('-');

    const playerIndex = confirmationData.players.findIndex(p => p.userId === userId);
    if (playerIndex !== -1) {
      confirmationData.players[playerIndex].confirmed = confirmed;
      confirmationData.players[playerIndex].responded = true;
      console.log(`Player ${userId} marked as ${confirmed ? 'confirmed' : 'declined'}`);
    } else {
      console.error(`Player ${userId} not found in confirmation data`);
    }

    // If not confirmed, remove from queue
    if (!confirmed) {
      const serverQueue = getServerQueues(guildId);
      const queue = serverQueue[queueType];
      const queuePlayerIndex = queue.players.findIndex(p => p.userId === userId);
      if (queuePlayerIndex !== -1) {
        queue.players.splice(queuePlayerIndex, 1);
        console.log(`Player ${userId} removed from queue ${queueType} in server ${guildId}`);
      } else {
        console.log(`Player ${userId} not found in queue ${queueType} in server ${guildId}`);
      }
    }
  } catch (error) {
    console.error('Error in markPlayerConfirmation:', error);
  }
}

// Check all confirmations
async function checkConfirmations(confirmationKey) {
  try {
    console.log(`Checking confirmations for key: ${confirmationKey}`);
    
    const confirmationData = pendingConfirmations.get(confirmationKey);
    if (!confirmationData) {
      console.error(`No confirmation data found for key: ${confirmationKey}`);
      return;
    }

    // Extract guild ID and queue type from the confirmation key
    const [guildId, queueType] = confirmationKey.split('-');
    console.log(`Guild ID: ${guildId}, Queue type: ${queueType}`);
    
    const { players, channel } = confirmationData;
    const serverQueue = getServerQueues(guildId);
    
    // Make sure the server queue exists
    if (!serverQueue) {
      console.error(`Server queue not found for guild: ${guildId}`);
      return;
    }
    
    const queue = serverQueue[queueType];
    
    // Make sure the queue exists
    if (!queue) {
      console.error(`Queue ${queueType} not found for guild: ${guildId}`);
      return;
    }

    // Filter confirmed players
    const confirmedPlayers = players.filter(p => p.confirmed);
    const declinedPlayers = players.filter(p => p.responded && !p.confirmed);
    const nonRespondingPlayers = players.filter(p => !p.responded);

    console.log(`Confirmed: ${confirmedPlayers.length}, Declined: ${declinedPlayers.length}, No response: ${nonRespondingPlayers.length}`);

    // Remove non-responding players from the queue
    const allNonConfirmedPlayers = [...declinedPlayers, ...nonRespondingPlayers];
    for (const player of allNonConfirmedPlayers) {
      const playerIndex = queue.players.findIndex(p => p.userId === player.userId);
      if (playerIndex !== -1) {
        queue.players.splice(playerIndex, 1);
        console.log(`Removed player ${player.username} from queue ${queueType}`);
      } else {
        console.log(`Player ${player.username} not found in queue ${queueType}`);
      }

      // Try to notify non-responding players
      if (nonRespondingPlayers.includes(player) && !player.userId.startsWith('debug-bot-')) {
        try {
          const user = await client.users.fetch(player.userId);
          await user.send(`You did not respond to the ${queueType} ProAvalon game confirmation in time. You have been removed from the queue.`);
        } catch (error) {
          console.error(`Failed to send DM to ${player.username}:`, error);
        }
      }
    }

    // If all confirmed, start the game
    if (confirmedPlayers.length === queue.requiredPlayers) {
      console.log(`All players confirmed! Starting ${queueType} game`);
      
      // Mention all confirmed players
      const mentions = confirmedPlayers
        .filter(p => !p.userId.startsWith('debug-bot-'))
        .map(p => `<@${p.userId}>`)
        .join(' ');

      const sentMessage = await channel.send({
        content: mentions || ' ',  // Send a space if no real users to mention
        embeds: [
          new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle(`${queueType} ProAvalon Game Confirmed!`)
            .setDescription(`All players have confirmed! Please join the ProAvalon lobby now.\n\nPlayers: ${
              confirmedPlayers.map(p => p.userId.startsWith('debug-bot-') ? `${p.username} (Bot)` : `<@${p.userId}>`).join(' ')
            }`)
            .setFooter({ text: 'Good luck and have fun!' })
        ]
      });
      
      // Track this message
      await trackChannelMessage(channel.id, queueType, sentMessage);

      // Remove confirmed players from the queue
      for (const player of confirmedPlayers) {
        const playerIndex = queue.players.findIndex(p => p.userId === player.userId);
        if (playerIndex !== -1) {
          queue.players.splice(playerIndex, 1);
          console.log(`Removed confirmed player ${player.username} from queue ${queueType}`);
        }
      }
    } else {
      // Not enough players confirmed, notify channel
      console.log(`Not enough players confirmed for ${queueType} game`);
      
      const sentMessage = await channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle(`${queueType} ProAvalon Game Cancelled`)
            .setDescription(`Not all players confirmed. ${confirmedPlayers.length} confirmed, ${declinedPlayers.length} declined, ${nonRespondingPlayers.length} did not respond.`)
            .setFooter({ text: 'Confirmed players remain in queue' })
        ]
      });
      
      // Track this message
      await trackChannelMessage(channel.id, queueType, sentMessage);
    }

    // Clear pending confirmations
    pendingConfirmations.delete(confirmationKey);
    console.log(`Cleared confirmation data for ${confirmationKey}`);
    
  } catch (error) {
    console.error('Error in checkConfirmations:', error);
  }
}

// Track channel message and clean up old ones
async function trackChannelMessage(channelId, queueType, message) {
  const key = `${channelId}-${queueType}`;
  
  if (!channelMessages[key]) {
    channelMessages[key] = [];
  }
  
  // Add new message to tracking with timestamp
  channelMessages[key].push({
    message,
    timestamp: Date.now()
  });
  
  // Keep only the 3 most recent messages, but delay deletion for at least 20 seconds
  if (channelMessages[key].length > 3) {
    // Get older messages (all except the 3 most recent)
    const oldMessages = channelMessages[key].slice(0, -3);
    channelMessages[key] = channelMessages[key].slice(-3);
    
    // Delete older messages if they're at least 20 seconds old
    for (const oldMsg of oldMessages) {
      const now = Date.now();
      const messageAge = now - oldMsg.timestamp;
      const messageToDelete = oldMsg.message; // Store reference to message
      
      if (messageAge >= 20000) { // 20 seconds in milliseconds
        try {
          if (messageToDelete && typeof messageToDelete.delete === 'function') {
            await messageToDelete.delete().catch(e => {
              console.log(`Failed to delete old message: ${e.message}`);
            });
          }
        } catch (error) {
          console.log(`Error deleting old message: ${error.message}`);
        }
      } else {
        // If message is too new, schedule deletion after it reaches 20 seconds
        const timeToWait = 20000 - messageAge;
        setTimeout(async () => {
          try {
            if (messageToDelete && typeof messageToDelete.delete === 'function') {
              await messageToDelete.delete().catch(e => {
                console.log(`Failed to delete scheduled message: ${e.message}`);
              });
            }
          } catch (error) {
            console.log(`Error deleting scheduled message: ${error.message}`);
          }
        }, timeToWait);
      }
    }
  }
  
  return message;
}

// Announce player joining queue
async function announcePlayerJoin(channel, user, queueType, guildId) {
  try {
    const serverQueue = getServerQueues(guildId);
    const queue = serverQueue[queueType];
    const currentPlayers = queue.players.length;
    const requiredPlayers = queue.requiredPlayers;
    const remainingPlayers = requiredPlayers - currentPlayers;

    // Select a random announcement message
    const messageTemplate = announceJoinMessages[Math.floor(Math.random() * announceJoinMessages.length)];

    // Replace placeholders
    const message = messageTemplate
      .replace('{player}', user.username)
      .replace('{queue}', queueType)
      .replace('{current}', currentPlayers)
      .replace('{required}', requiredPlayers)
      .replace('{remaining}', remainingPlayers);

    // Create a button to join this queue
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`join-queue-${queueType}`)
          .setLabel(`Join ${queueType} Queue`)
          .setStyle(ButtonStyle.Primary),
      );

    // Send message with button
    const sentMessage = await channel.send({ content: message, components: [row] });
    
    // Track the message for this queue type and clean up old ones
    await trackChannelMessage(channel.id, queueType, sentMessage);
  } catch (error) {
    console.error('Error in announcePlayerJoin:', error);
  }
}

// Handle queue status command
async function handleQueueStatus(interaction) {
  try {
    const guildId = interaction.guild.id;
    const serverQueue = getServerQueues(guildId);
    
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('ProAvalon Queue Status')
      .setDescription(`Current status of all ProAvalon queues in this server (Server time: ${getCurrentDateTimeWithTZ()}):`)
      .setTimestamp();

    for (const [queueType, queueData] of Object.entries(serverQueue)) {
      const playerCount = queueData.players.length;
      const requiredPlayers = queueData.requiredPlayers;

      const playerList = queueData.players.map(p => {
        let playerInfo = p.username;
        if (p.timeRange) {
          playerInfo += ` (Available until ${p.timeRange.end}`;
          if (p.timeRange.timezone && p.timeRange.timezone !== 'UTC') {
            playerInfo += ` ${p.timeRange.timezone}`;
          }
          playerInfo += `)`;
        }
        return playerInfo;
      }).join(', ') || 'No players';

      embed.addFields({ 
        name: `${queueType} (${playerCount}/${requiredPlayers})`, 
        value: playerList
      });
    }

    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error('Error in handleQueueStatus:', error);
    await sendTrackedEphemeral(interaction, 'There was an error fetching the queue status. Please try again.');
  }
}

// Start the bot
client.login(process.env.DISCORD_TOKEN);