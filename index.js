const config = require('./config.json');

const Database = require('easy-json-database');
const db = new Database('./db.json');
if (!db.has('subscriptions')) db.set('subscriptions', []);

const Discord = require('discord.js');
const client = new Discord.Client({
    intents: [Discord.Intents.FLAGS.GUILDS]
});

const synchronizeSlashCommands = require('discord-sync-commands');
synchronizeSlashCommands(client, [
{
        name: 'abonner',
        description: 'Abonnez-vous à une URL de recherche',
        options: [{
                name: 'url',
                description: 'L\'URL de la recherche Vinted',
                type: 3,
                required: true
            },
            {
                name: 'channel',
                description: 'Le salon dans lequel vous souhaitez envoyer les notifications',
                type: 7,
                required: true
            }
        ]
    },
    {
        name: 'désabonner',
        description: 'Désabonnez-vous d\'une URL de recherche',
        options: [{
            name: 'id',
            description: 'L\'identifiant de l\'abonnement (/abonnements)',
            type: 3,
            required: true
        }]
    },
    {
        name: 'abonnements',
        description: 'Accèdez à la liste de tous vos abonnements',
        options: []
    }
], {
    debug: true,
    guildId: config.guildID
}).then((stats) => {
    console.log(`🔁 Commandes mises à jour ! ${stats.newCommandCount} commandes créées, ${stats.currentCommandCount} commandes existantes\n`)
});

const vinted = require('vinted-api');

let lastFetchFinished = true;

const syncSubscription = (sub) => {
    return new Promise((resolve) => {
        vinted.search(sub.url, false, false, {
            per_page: '40'
        }).then((res) => {
            if (!res.items) {
                console.log('Search done bug got wrong response. Promise resolved.', res);
                resolve();
                return;
            }
            const isFirstSync = db.get('is_first_sync');
            const lastItemTimestamp = db.get(`last_item_ts_${sub.id}`);
            const items = res.items
                .sort((a, b) => new Date(b.created_at_ts).getTime() - new Date(a.created_at_ts).getTime())
                .filter((item) => !lastItemTimestamp || new Date(item.created_at_ts) > lastItemTimestamp);

            if (!items.length) return void resolve();

            const newLastItemTimestamp = new Date(items[0].created_at_ts).getTime();
            if (!lastItemTimestamp || newLastItemTimestamp > lastItemTimestamp) {
                db.set(`last_item_ts_${sub.id}`, newLastItemTimestamp);
            }

            const itemsToSend = ((lastItemTimestamp && !isFirstSync) ? items.reverse() : [items[0]]);

            for (let item of itemsToSend) {
                const embed = new Discord.MessageEmbed()
                    .setTitle(item.title)
                    .setURL(`https://www.vinted.fr${item.path}`)
                    .setImage(item.photos[0]?.url)
                    .setColor('RANDOM')
                    .setTimestamp(new Date(item.created_at_ts))
                    .setFooter(`Article lié à la recherche : ${sub.id}`)
                    .addField('Prix', item.price || 'vide', true)
                    .addField('Vendeur', item.user_login || 'vide', true)
                    .addField('Note vendeur', `${getReputationStars(item.user.feedback_reputation)} (${(item.user.positive_feedback_count || 0) + (item.user.neutral_feedback_count || 0) + (item.user.negative_feedback_count || 0)})` || 'vide', true)
                    .addField('Condition', item.status || 'vide', true)
                    .addField('Taille', item.size || 'vide', true)
               
                client.channels.cache.get(sub.channelID)?.send({
                    embeds: [embed],
                    components: [
                        new Discord.MessageActionRow()
                        .addComponents([
                            new Discord.MessageButton()
                            .setLabel('Détails')
                            .setURL(item.url)
                            .setEmoji('🔎')
                            .setStyle('LINK'),
                            new Discord.MessageButton()
                            .setLabel('Acheter')
                            .setURL(`https://www.vinted.fr/transaction/buy/new?source_screen=item&transaction%5Bitem_id%5D=${item.id}`)
                            .setEmoji('💸')
                            .setStyle('LINK'),
                            new Discord.MessageButton()
                            .setLabel('Envoyez un Message')
                            .setURL(`https://www.vinted.fr//items/${item.id}/want_it/new?button_name=receiver_id=${item.id}`)
			                .setEmoji('📨')
			                .setStyle('LINK')
                        		
	])
                    ]
                });
            }

            if (itemsToSend.length > 0) {
                console.log(`👕 ${itemsToSend.length} ${itemsToSend.length > 1 ? 'nouveaux articles trouvés' : 'nouvel article trouvé'} pour la recherche ${sub.id} !\n`)
            }

            resolve();
        }).catch((e) => {
            console.error('Je cherche ....', e);
            resolve();
        });
    });
};

const sync = () => {

    if (!lastFetchFinished) return;
    lastFetchFinished = true;

    setTimeout(() => {
        lastFetchFinished = true;
    }, 2000);

    console.log(`🤖 Synchronisation à Vinted...\n`);

    const subscriptions = db.get('subscriptions');
    const promises = subscriptions.map((sub) => syncSubscription(sub));
    Promise.all(promises).then(() => {
        db.set('is_first_sync', false);
        lastFetchFinished = true;
    });

};

client.on('ready', () => {
    console.log(`🔗 Connecté sur le compte de ${client.user.tag} !\n`);

    const entries = db.all().filter((e) => e.key !== 'subscriptions' && !e.key.startsWith('last_item_ts'));
    entries.forEach((e) => {
        db.delete(e.key);
    });
    db.set('is_first_sync', true);

    const messages = [
        `https://discord.com`,

    ];
    let idx = 0;
    const donate = () => console.log(messages[idx % 2]);
    setTimeout(() => {
        donate();
    }, 3000);
    setInterval(() => {
        idx++;
        donate();
    }, 120000);

    sync();
    setInterval(sync, 5000);

    const { version } = require('./package.json');
    client.user.setActivity(` | v${version}`);
});

client.on('interactionCreate', (interaction) => {

    if (!interaction.isCommand()) return;
    if (!config.adminIDs.includes(interaction.user.id)) return void interaction.reply(`:x: Vous ne disposez pas des droits pour effectuer cette action !`);

    switch (interaction.commandName) {
        case 'abonner':
            {
                const sub = {
                    id: Math.random().toString(36).substring(7),
                    url: interaction.options.getString('url'),
                    channelID: interaction.options.getChannel('channel').id
                }
                db.push('subscriptions', sub);
                db.set(`last_item_ts_${sub.id}`, null);
                interaction.reply(`:white_check_mark: Votre abonnement a été créé avec succès !\n**URL**: <${sub.url}>\n**Salon**: <#${sub.channelID}>`);
                break;
            }
        case 'désabonner':
            {
                const subID = interaction.options.getString('id');
                const subscriptions = db.get('subscriptions')
                const subscription = subscriptions.find((sub) => sub.id === subID);
                if (!subscription) {
                    return void interaction.reply(':x: Aucun abonnement trouvé pour votre recherche...');
                }
                const newSubscriptions = subscriptions.filter((sub) => sub.id !== subID);
                db.set('subscriptions', newSubscriptions);
                interaction.reply(`:white_check_mark: Abonnement supprimé avec succès !\n**URL**: <${subscription.url}>\n**Salon**: <#${subscription.channelID}>`);
                break;
            }
        case 'abonnements':
            {
                const subscriptions = db.get('subscriptions');
                const chunks = [];

                subscriptions.forEach((sub) => {
                    const content = `**ID**: ${sub.id}\n**URL**: ${sub.url}\n**Salon**: <#${sub.channelID}>\n`;
                    const lastChunk = chunks.shift() || [];
                    if ((lastChunk.join('\n').length + content.length) > 1024) {
                        if (lastChunk) chunks.push(lastChunk);
                        chunks.push([content]);
                    } else {
                        lastChunk.push(content);
                        chunks.push(lastChunk);
                    }
                });

                interaction.reply(`:white_check_mark: **${subscriptions.length}** abonnements sont actifs !`);

                chunks.forEach((chunk) => {
                    const embed = new Discord.MessageEmbed()
                        .setColor('RANDOM')
                        .setAuthor(`Utilisez la commande /désabonner pour supprimer un abonnement !`)
                        .setDescription(chunk.join('\n'));

                    interaction.channel.send({ embeds: [embed] });
                });
            }
    }
});


function getReputationStars(reputationPercent) {
    let reputCalc = Math.round(reputationPercent / 0.2);
    let reputDemiCalc = reputationPercent % 0.2;

    let starsStr = '';

    for (let i = 0; i < reputCalc; i++) {
        starsStr += ':star:';
    }

    if (reputDemiCalc !== 0 && reputCalc < 5) {
        starsStr += '<:half_star:906229706498666546>';
    }

    return starsStr;
}

client.login("OTQyNTI2NzUyODAxMDUwNjg0.YglycQ.65K-gwHS45KBbPfUhCVzMqNlcEw");