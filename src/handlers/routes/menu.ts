import { Container, Contracts, Utils, Providers } from "@arkecosystem/core-kernel";
import { Managers, Interfaces } from "@arkecosystem/crypto";
import { Markup } from "telegraf";
import { BigIntToString, BigIntToBString } from "../../Utils/utils";
import { coingecko_request } from "../../Utils/coingecko";
import { UContext } from "../../interfaces";

@Container.injectable()
export class menu {

    @Container.inject(Container.Identifiers.WalletRepository)
    @Container.tagged("state", "blockchain")
    private readonly wallets!: Contracts.State.WalletRepository;

    @Container.inject(Container.Identifiers.TransactionHistoryService)
    private readonly transactionHistoryService!: Contracts.Shared.TransactionHistoryService;

    @Container.inject(Symbol.for("display_transactions"))
    private readonly display_transactions;

    @Container.inject(Symbol.for("alerts_handler"))
    private readonly alerts_handler;

    @Container.inject(Container.Identifiers.BlockchainService)
    private readonly blockchain!: Contracts.Blockchain.Blockchain;

    @Container.inject(Container.Identifiers.DposState)
    private readonly dpos_state!: Contracts.State.DposState;

    @Container.inject(Symbol.for("menu_utils"))
    private readonly menu_utils;

    @Container.inject(Symbol.for("database"))
    private readonly db;

    @Container.inject(Container.Identifiers.PluginConfiguration)
    @Container.tagged("plugin", "@cactus1549/ark-monitor")
    private readonly configuration!: Providers.PluginConfiguration;

    

    public balance = async (ctx: UContext) =>  {
        let total_value_usd = 0;
        let total_value_btc = 0;
        let total_balance = Utils.BigNumber.ZERO;
        let answer: string = "";
        let i = 0;
        const coingecko = await coingecko_request(this.get_coingecko_ticker());
        
        for (const db_wallet of ctx.user.voters){
            i++;
            const wallet: Contracts.State.Wallet = this.wallets.findByAddress(db_wallet.address);
            const balance = wallet.getBalance();
            total_balance = total_balance.plus(balance);

            answer += "Wallet ";
            if (db_wallet.name === undefined){
                answer += db_wallet.address;
            }else{
                answer += `${db_wallet.name} (${db_wallet.address})`;
            }

            answer += `\nBalance: ${this.get_symbol()} ${BigIntToBString(balance, 2)}\nWorth: `;
            if (coingecko !== undefined){
                const value_usd = Number(BigIntToString(balance, 8)) * coingecko.market_data.current_price.usd
                total_value_usd += value_usd;
                const value_btc = Number(BigIntToString(balance, 8)) * coingecko.market_data.current_price.btc
                total_value_btc += value_btc;
                answer += `${(Math.round(value_btc * 100000) / 100000).toFixed(5)} BTC ($${(Math.round(value_usd * 100) / 100).toFixed(2)})\n`
            }else{
                answer += `??? BTC ($???)\n`;
            }
            
            if (wallet.hasAttribute("vote")){
                const delegate: Contracts.State.Wallet = this.wallets.findByPublicKey(wallet.getAttribute("vote"));
                answer += `Vote: ${delegate.getAttribute("delegate.username")}`;
                if (delegate.hasAttribute("delegate.resigned") && delegate.getAttribute("delegate.resigned")) {
                    answer += " (Resigned)";
                }
                else if (delegate.getAttribute("delegate.rank") > 51){
                    answer += " (Not Forging)";
                }
                answer += "\n";
            }
            if (i < 5){
                answer += "\n";
            }else {
                ctx.reply(answer);
                answer = "";
                i = 0;
            }
        }
            
        if (ctx.user.voters.length > 1){
            answer += "\n------------------------------------------------------------------\n";
            answer += `Total balance: ${this.get_symbol()}${BigIntToBString(total_balance, 2)}\nWorth: `;
            if (coingecko !== undefined){
                answer += `${(Math.round(total_value_btc * 100000) / 100000).toFixed(5)} BTC ($${(Math.round(total_value_usd * 100) / 100).toFixed(2)})`;
            }
            else{
                answer += `??? BTC ($ ???)`;
            }
        }
        
        ctx.reply(answer, {reply_markup: Markup.inlineKeyboard([Markup.callbackButton("Update", "update_balance")])});
    }
    
    public last_transactions = async (ctx: UContext)=>  {
        let data: Array<any>;
        if (ctx.user.states[0] === "Dmenu"){
            data = ctx.user.delegates;
            if (data.length === 1){
                ctx.reply(`Transactions of ${data[0].username}`)
                const transactions: Interfaces.ITransactionData[] = await this.transactionHistoryService.findManyByCriteria({ address: data[0].address });
                let message = ""
                const start = Math.max(transactions.length - 5, 0);
                for (const transaction of transactions.slice(start, start + 5).reverse()){
                    message += await this.display_transactions.display(transaction, data[0].address, ctx.chat_id);
                    message += "\n------------------------------------------------------------------\n";
                }
                let keyboard;
                    if (transactions.length <= 5) keyboard = { reply_markup: {inline_keyboard: [[{text: "1", callback_data: "a"}]]}}
                    else keyboard = { reply_markup: {inline_keyboard: [[{text: "1", callback_data: "a"}, {text: "next", callback_data: `next_1_${data[0].address}`}]]}};
                ctx.replyWithHTML(message, keyboard);
                return;
            }
        }
        else{
            data = ctx.user.voters;
            if (data.length === 1){
                if (data[0].name === undefined){
                    ctx.reply(`Transactions of ${data[0].address}`)
                }else{
                    ctx.reply(`Transactions of ${data[0].name} (${data[0].address})`)
                }
                const transactions: Interfaces.ITransactionData[] = await this.transactionHistoryService.findManyByCriteria({ address: data[0].address });
                let message = ""
                const start = Math.max(transactions.length - 5, 0);
                for (const transaction of transactions.slice(start, start + 5).reverse()){
                    message += await this.display_transactions.display(transaction, data[0].address, ctx.chat_id);
                    message += "\n------------------------------------------------------------------\n";
                }
                let keyboard;
                    if (transactions.length <= 5) keyboard = { reply_markup: {inline_keyboard: [[{text: "1", callback_data: "a"}]]}}
                    else keyboard = { reply_markup: {inline_keyboard: [[{text: "1", callback_data: "a"}, {text: "next", callback_data: `next_1_${data[0].address}`}]]}};
                ctx.replyWithHTML(message, keyboard);
                return;
            }
        }
        this.db.enter_menu(ctx.chat_id, ctx.user.states, "last_transaction");
        let keyboard: any[] = [];
        let row: string[] = [];
        for (let r = 0; r < data.length; r++){
            row.push(data[r].name || data[r].username || data[r].address);
            if ((r + 1) % 2){
                keyboard.push(row);
                row = [];
            }
        }
        if (row.length){
            keyboard.push(row);
        }
        keyboard.push(["/Back"])

        ctx.reply(`Which wallet do you want to check the transactions?`,  {reply_markup: Markup.keyboard(keyboard)});
    }
    
    public price = async (ctx: UContext) =>  {
        const coingecko = await coingecko_request(this.get_coingecko_ticker());
        if (coingecko === undefined){
            ctx.reply("There are problems with CoinGecko. Try again later.", {reply_markup: Markup.inlineKeyboard([Markup.callbackButton("Update", "update_price")])});
            return;
        }
        else{
            const data = coingecko.market_data;
        
            const price = data.current_price.usd
            const price_btc = data.current_price.btc
            const rank = data.market_cap_rank
            const volume = data.total_volume.usd
            const volume_btc = data.total_volume.btc
            const market_cap = data.market_cap.usd
            const market_cap_btc = data.market_cap.btc
            const change_24h = data.price_change_percentage_24h
            const change_7d = data.price_change_percentage_7d
            const circulating = data.circulating_supply
            const total_supply = data.total_supply
            
            ctx.reply(`${this.get_symbol()} STATS:\nPrice: ${price_btc} BTC ($${price})\nMarket cap rank: ${rank}\n\nMarket cap: ${market_cap_btc} BTC ($${market_cap})\nVolume: ${volume_btc} BTC ($${volume})\n\n24h change: ${change_24h}%\n7d change: ${change_7d}%\n\nCirculating supply: ${this.get_symbol()}${circulating}\nTotal supply: ${this.get_symbol()}${total_supply}\n`, {reply_markup: Markup.inlineKeyboard([Markup.callbackButton("Update", "update_price")])})
        }
    }
    
    public rednodes = async (ctx: UContext) =>  {
        let orange = ""
        let red = ""
        let n_orange = 0
        let n_red = 0
        const rednodes = this.alerts_handler.get_missing_delegates();
        rednodes.forEach((missed, pkey) => {
            const red_delegate_wallet: Contracts.State.Wallet = this.wallets.findByPublicKey(pkey);
            const username = red_delegate_wallet.getAttribute("delegate.username");
            if (missed === 1){
                n_orange +=1;
                orange += `\n${username} is orange`;
                if (ctx.user.delegates.some(delegate => delegate.username === username)){
                    orange += ` (+++YOU+++)`
                }else{
                    const voting_wallet = ctx.user.voters.filter((voter) =>{
                        const wallet: Contracts.State.Wallet = this.wallets.findByAddress(voter.address);
                        if (wallet.hasVoted()){
                            return (wallet.getAttribute("vote") === pkey);
                        }
                        return false;
                    })
                    if (voting_wallet.length){
                        orange += `\n|___(voted by ${voting_wallet[0].name || voting_wallet[0].address})`;
                    }
                    
                }
            }else{
                n_red += 1;
                const milestone = Managers.configManager.getMilestone(this.blockchain.getLastHeight());
                const days = (missed * milestone.blocktime * milestone.activeDelegates)/60/60/24;
                if (ctx.user.delegates.some(delegate => delegate.username === username)){
                    
                    red += `\n_+++YOU ARE RED+++ (${username})\n|___Missed blocks: ${missed} ~ ${Math.round(days)} day(s)`;
                }else{
                    red += `\n_${username} is red. `;
                    const voting_wallet = ctx.user.voters.filter((voter) =>{
                        const wallet: Contracts.State.Wallet = this.wallets.findByAddress(voter.address);
                        if (wallet.hasVoted()){
                            return (wallet.getAttribute("vote") === pkey);
                        }
                        return false;
                    })
                    if (voting_wallet.length){
                        red += `\n|___(voted by ${voting_wallet[0].name || voting_wallet[0].address})`;
                    }
                    red += `\n|___Missed blocks: ${missed} ~ ${Math.round(days)} day(s)`;

                }
            }
        });
        
        if (orange != "")
            ctx.reply(`ORANGE NODES (${n_orange}).${orange}`);
        if (red != "")
            ctx.reply(`RED NODES (${n_red}).${red}`);
        if (orange == "" && red == "")
            ctx.reply("No rednodes");
                
    }
    
    public voter_notifications = (ctx: UContext) =>  {
        let voters = ctx.user.voters;
        if (voters.length < 2){
            const voter = voters[0];
            this.db.enter_menu(ctx.chat_id, ctx.user.states, "notifications/wallet/" + voter.address)
            ctx.reply(`REDNODES notify you when a ${this.get_delegate_name()} you are voting misses blocks.'
                '\nOUT OF FORGING notify you when the ${this.get_delegate_name()} you are voting become an active/standby ${this.get_delegate_name()} 
                '\nPAYMENTS notify you when you receive/send coins.`)
            ctx.reply('Choose the notification you want to turn on or off',  {reply_markup: Markup.keyboard(
                    [['Rednodes: ' + voter.Rednodes, "Out of Forging: " + voter.Out_of_forging],
                    ["Payments: " + voter.Transactions],
                    ["/Back"]])});        
        }
        else{
            this.db.enter_menu(ctx.chat_id, ctx.user.states, "notifications");
            let keyboard: any[] = [];
            let row: string[] = [];
            for (let r = 0; r < voters.length; r++){
                row.push(voters[r].name || voters[r].address);
                if (voters.length % 2){
                    keyboard.push(row);
                    row = [];
                }
            }
            if (row.length){
                keyboard.push(row);
            }
            row = ["/Back"]
            keyboard.push(row);

            ctx.reply("Which wallet do you want to change the notifications?",  {reply_markup: Markup.keyboard(keyboard)});

        } 

    }
    
    public links = (ctx: UContext) =>  {
        let links = this.configuration.get("links");
        if (links === undefined || typeof links !== "string") links = "Links not set on config";
        else ctx.reply(links);
    }
    
    public send_feedback = (ctx: UContext) =>  {
        this.db.enter_menu(ctx.chat_id, ctx.user.states, "feedback")
        ctx.reply("Write here your feedback or use /Back to go back.",  {reply_markup: Markup.keyboard([["/Back"]])});
    }
    
    public change_menu = (ctx: UContext) =>  {
        if (ctx.user.states[0] == "Dmenu" && ctx.user.voters.length){
            this.db.change_root(ctx.chat_id, "Vmenu");
        }else if (ctx.user.states[0] == "Vmenu" && ctx.user.delegates.length){
            this.db.change_root(ctx.chat_id, "Dmenu");
        }
        this.menu_utils.display_menu(ctx);

    }
    
    public settings = (ctx: UContext) =>  {
        this.db.enter_menu(ctx.chat_id, ctx.user.states, "settings");
        let data: any[];
        let extra = ["+Add"];
        if (ctx.user.states[0] === "Dmenu"){
            data = ctx.user.delegates;
            if (!ctx.user.voters.length)
                extra.push("+Add voter");
        }
        else{
            data = ctx.user.voters;
            if (!ctx.user.delegates.length)
                extra.push(`+Add ${this.get_delegate_name()}`);
        }
        extra.push("/Back");

        let keyboard: any[] = [];
        let row: string[] = [];
        for (let r = 0; r < data.length; r++){
            row.push(data[r].name || data[r].username || data[r].address);
            if ((r + 1) % 2){
                keyboard.push(row);
                row = [];
            }
        }
        if (row.length){
            keyboard.push(row);
        }
        for (const line of extra)
            keyboard.push([line]);

        if (ctx.user.states[0] === "Dmenu")
            ctx.reply(`Which ${this.get_delegate_name()} do you want to modify?`,  {reply_markup: Markup.keyboard(keyboard)})
        else
            ctx.reply("Which wallet do you want to modify?",  {reply_markup: Markup.keyboard(keyboard)})
    }
    
    public info = (ctx: UContext) =>  {
        let info = this.configuration.get("info");
        if (info === undefined || typeof info !== "string") info = "Info not set on config";
        else ctx.reply(info);
    }
    
    public delegates_info = async (ctx: UContext) =>  { 
        let message = "DELEGATES INFO:\n";
        const delegates = ctx.user.delegates;
        let i = 0;
        for (const delegate of delegates){
            i++;
            const current_height = this.blockchain.getLastHeight();
            const milestone = Managers.configManager.getMilestone(current_height);
            const wallet: Contracts.State.Wallet = this.wallets.findByUsername(delegate.username);
            const pkey = wallet.getPublicKey();
            const delegateAttribute = wallet.getAttribute("delegate");
            const username = delegateAttribute.username;
            const produced = delegateAttribute.producedBlocks;
            const rank = delegateAttribute.rank;

            this.dpos_state.buildDelegateRanking();
            
            const needed_delegates = this.dpos_state.getActiveDelegates().filter(delegate => {
                if (!(delegate.hasAttribute("delegate.rank"))) return false;
                const delegate_rank = delegate.getAttribute("delegate.rank");
                return (Math.abs(delegate_rank - rank) === 1 || delegate_rank === milestone.activeDelegates);
            })


            if (delegateAttribute.resigned && delegateAttribute.resigned === true){
                message += `(Resigned) ${username}\n`;
            }else{
                message += `(${rank}) ${username}\n`
                message += `VOTES: ${BigIntToBString(delegateAttribute.voteBalance, 2)}(${Utils.delegateCalculator.calculateApproval(wallet)}%)\n`

                const minor_rank = needed_delegates.find(delegate => delegate.getAttribute("delegate.rank") - rank === 1);
                const greater_rank = needed_delegates.find(delegate => delegate.getAttribute("delegate.rank") - rank === -1);
                const forge_rank = needed_delegates.find(delegate => delegate.getAttribute("delegate.rank") === milestone.activeDelegates);
                if (rank <= milestone.activeDelegates){
                    message += `|_TO ${milestone.activeDelegates + 1}th: `;
                }else{
                    message += `|_TO ${milestone.activeDelegates}th: `;
                }
                if (forge_rank != undefined)
                    message += `${BigIntToBString(forge_rank.getAttribute("delegate.voteBalance").minus(delegateAttribute.voteBalance), 2)}\n`
                if (minor_rank != undefined)
                    message += `|_TO -1: ${BigIntToBString(minor_rank.getAttribute("delegate.voteBalance").minus(delegateAttribute.voteBalance), 2)}\n`
                if (greater_rank != undefined)
                    message += `|_TO +1: ${BigIntToBString(greater_rank.getAttribute("delegate.voteBalance").minus(delegateAttribute.voteBalance), 2)}\n\n`

                
            }
            message += `Produced blocks: ${produced}\n`;

            if (delegateAttribute.lastBlock && rank <= milestone.activeDelegates) {
                const secondsToHms = (d: number) => {
                    const h = Math.floor(d / 3600);
                    const m = Math.floor(d % 3600 / 60);
                    const s = Math.floor(d % 3600 % 60);
                    
                    if (h > 0){
                        return h + (h == 1 ? " hour " : " hours ");
                    }else if (m > 0){
                        return m + (m == 1 ? " minute " : " minutes ");
                    }
                    return s + (s == 1 ? " second" : " seconds");
                }
                const last_block_height = delegateAttribute.lastBlock.height;
                message += `last block forged ${secondsToHms((current_height - last_block_height)*milestone.blocktime)} ago\n` +
                            `|_Height: ${last_block_height}\n|_Timestamp: ${Utils.formatTimestamp(delegateAttribute.lastBlock.timestamp).human}\n`
                const missed_blocks = this.alerts_handler.get_missing_delegates();
                const missed = missed_blocks.get(pkey);
                if (missed !== undefined){
                    message += `YOUR NODE IS RED\nYOUR ${this.get_delegate_name().toUpperCase()} HAS MISSED ${missed} BLOCKS SO FAR!\n`
                }

                message += `\nTotal forged: ${BigIntToBString(delegateAttribute.forgedFees, 2)}\n` +
                            `|_Rewards: ${BigIntToBString(delegateAttribute.forgedRewards, 2)}\n` +
                            `|_fees: ${BigIntToBString(delegateAttribute.forgedFees.plus(delegateAttribute.forgedRewards), 2)}\n\n`
            }else{
                message += "\n"
            }

            if (i >= 5){
                ctx.reply(message); 
                message = "";
                i = 0;
            }
        }
    
        ctx.reply(message, {reply_markup: Markup.inlineKeyboard([Markup.callbackButton("Update", "update_delegateinfo")])});    
    }
    
    public delegate_notifications = (ctx: UContext) => {
        
        let delegates = ctx.user.delegates;
        if (delegates.length < 2){
            let delegate = delegates[0];
            this.db.enter_menu(ctx.chat_id, ctx.user.states, "notifications/delegate/" + delegate.address)
            ctx.reply(`'REDNODE notify you when your ${this.get_delegate_name()} misses blocks. 
            \nPOSITION notify you when your ${this.get_delegate_name()} make a change in rank.'
            \nVOTES notify when there is a change in your votes amount.'
            \nVOTERS notify when someone vote/unvote you.`)
            let keyboard;
            if (delegate.Votes === "OFF"){
                keyboard = [['Rednode: ' + delegate.Missing, "Position: " + delegate.Position],
                    ["Votes: " + delegate.Votes, "Voters: " + delegate.Voters],
                    ["/Back"]]
            }else{
                keyboard = [['Rednode: ' + delegate.Missing, "Position: " + delegate.Position],
                    ["Votes: ON/Cap: " + delegate.Votes, "Voters: " + delegate.Voters],
                    ["/Back"]]
            }
            ctx.reply('Choose the notification you want to turn on or off',  {reply_markup: Markup.keyboard(keyboard)});        
        }
        else{
            this.db.enter_menu(ctx.chat_id, ctx.user.states, "notifications");
            let keyboard: any[] = [];
            let row: string[] = [];
            for (let r = 0; r < delegates.length; r++){
                row.push(delegates[r].username);
                if (delegates.length % 2){
                    keyboard.push(row);
                    row = [];
                }
            }
            if (row.length){
                keyboard.push(row);
            }
            keyboard.push(["/Back"]);

            ctx.reply("Which wallet do you want to change the notifications?",  {reply_markup: Markup.keyboard(keyboard)});

        } 
    }

    private get_delegate_name(): string {
        const config_delegate_name = this.configuration.get("delegate_name");
        if (config_delegate_name === undefined || typeof config_delegate_name !== "string") return "delegate";
        return config_delegate_name;
    }

    private get_symbol(){
        return Managers.configManager.get("network").client.symbol;
    }

    private get_coingecko_ticker(): string | undefined {
        const ticker = this.configuration.get("ticker");
        if (ticker === undefined || typeof ticker !== "string") return undefined;
        return ticker;
    }
}