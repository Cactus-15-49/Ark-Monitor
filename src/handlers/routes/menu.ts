import { Container, Contracts, Utils, Providers } from "@arkecosystem/core-kernel";
import { Managers } from "@arkecosystem/crypto";
import { Markup } from "telegraf";
import { BigIntToString } from "../../Utils/utils";
import { UContext, missed_block } from "../../interfaces";

@Container.injectable()
export class menu {

    @Container.inject(Container.Identifiers.WalletRepository)
    @Container.tagged("state", "blockchain")
    private readonly wallets!: Contracts.State.WalletRepository;

    @Container.inject(Container.Identifiers.TransactionHistoryService)
    private readonly transactionHistoryService!: Contracts.Shared.TransactionHistoryService;

    @Container.inject(Symbol.for("display_transactions"))
    private readonly dislpay_transactions;

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
    @Container.tagged("plugin", "@cactus1549/telegram-bot")
    private readonly configuration!: Providers.PluginConfiguration;

    

    public balance = (ctx: UContext) =>  {
        let total_value_usd = Utils.BigNumber.ZERO;
        let total_value_btc = Utils.BigNumber.ZERO;
        let total_balance = Utils.BigNumber.ZERO;
        let answer: string = "";
        let i = 0;
        const cmc = false;//const cmc = r.cmc_request()
        for (let db_wallet of ctx.user.voters){
            i++;
            let wallet: Contracts.State.Wallet = this.wallets.findByAddress(db_wallet.address);
            let balance = wallet.balance;
            total_balance = total_balance.plus(balance);

            answer += "Wallet ";
            if (db_wallet.name == undefined){
                answer += db_wallet.address;
            }else{
                answer += `${db_wallet.name} (${db_wallet.address})`;
            }

            answer += `\nBalance: ${this.get_symbol()} ${BigIntToString(balance, 2)}\nWorth: `;
            if (cmc){
                let value_usd = balance.times(cmc["market_data"]["current_price"]["usd"])
                total_value_usd = total_value_usd.plus(value_usd);
                let value_btc = balance.times(cmc["market_data"]["current_price"]["btc"])
                total_value_btc = total_value_btc.plus(value_btc);
                answer += `${BigIntToString(value_btc, 2)} BTC ($${BigIntToString(value_usd, 2)})\n`
            }else{
                answer += `??? BTC ($???)\n`;
            }
            
            if (wallet.hasAttribute("vote")){
                const delegate: Contracts.State.Wallet = this.wallets.findByPublicKey(wallet.getAttribute("vote"));
                answer += `Vote: ${delegate.getAttribute("delegate.username")}\n`;
                if (delegate.hasAttribute("delegate.resigned") && delegate.getAttribute("delegate.resigned")) {
                    answer += " (Resigned)\n";
                }
                else if (delegate.getAttribute("delegate.rank") > 51){
                    answer += " (Not Forging)\n";
                }
            }
            if (i < 5){
                answer += "\n";
            }else {
                ctx.reply(answer);
                answer = "";
            }
        }
            
        if (ctx.user.voters.length > 1){
            answer += "\n------------------------------------------------------------------\n";
            answer += `Total balance: ${this.get_symbol()}${BigIntToString(total_balance, 2)}\nWorth: `;
            if (cmc){
                answer += `${BigIntToString(total_value_btc, 2)} BTC ($${BigIntToString(total_value_usd, 2)})`;
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
                const transactions = await this.transactionHistoryService.findManyByCriteria({ address: data[0].address });
                let message = ""
                let start = Math.max(transactions.length - 5, 0);
                for (const transaction of transactions.slice(start, start + 5).reverse()){
                    message += await this.dislpay_transactions.display(transaction, data[0].address, ctx.chat_id);
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
                if (data[0].name == undefined){
                    ctx.reply(`Transactions of ${data[0].address}`)
                }else{
                    ctx.reply(`Transactions of ${data[0].name} (${data[0].address})`)
                }
                const transactions = await this.transactionHistoryService.findManyByCriteria({ address: data[0].address });
                let message = ""
                let start = Math.max(transactions.length - 5, 0);
                for (const transaction of transactions.slice(start, start + 5).reverse()){
                    message += await this.dislpay_transactions.display(transaction, data[0].address, ctx.chat_id);
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
        let line: string[] = [];
        for (let r = 0; r < data.length; r++){
            line.push(data[r].name || data[r].username || data[r].address);
            if ((r + 1) % 2){
                keyboard.push(line);
                line = [];
            }
        }
        if (line.length){
            keyboard.push(line);
        }
        keyboard.push(["/Back"])

        ctx.reply(`Which wallet do you want to check the transactions?`,  {reply_markup: Markup.keyboard(keyboard)});
    }
    
    public price = (ctx: UContext) =>  {
        let cmc = false;//let cmc = r.cmc_request()
        if (!cmc){
            ctx.reply("There are problems with CoinGecko. Try again later.", {reply_markup: Markup.inlineKeyboard([Markup.callbackButton("Update", "update_price")])});
            return;
        }
        else{
            cmc = cmc["market_data"];
        
            let price = cmc["market_data"]["current_price"]["usd"]
            let price_btc = cmc["market_data"]["current_price"]["btc"]
            let volume = cmc["market_data"]["total_volume"]["usd"]
            let volume_btc = cmc["market_data"]["total_volume"]["btc"]
            let market_cap = cmc["market_data"]["market_cap"]["usd"]
            let market_cap_btc = cmc["market_data"]["market_cap"]["btc"]
            let change_24h = cmc["market_data"]["price_change_percentage_24h"]
            let change_7d = cmc["market_data"]["price_change_percentage_7d"]
            let circulating = cmc["market_data"]["circulating_supply"]
            let total_supply = 0 //int(r.bc_request("blockchain")["data"]["supply"])/100000000
            
            ctx.reply(`${this.get_symbol()} STATS:\nPrice: ${price_btc} BTC ($${price})\nMarket cap: ${market_cap_btc} BTC ($${market_cap})\nVolume: ${volume_btc} BTC ($${volume})\n24h change: ${change_24h}%\n7d change: ${change_7d}%\nCirculating supply: ${this.get_symbol()}${circulating}\nTotal supply: ${this.get_symbol()}${total_supply}\n`, {reply_markup: Markup.inlineKeyboard([Markup.callbackButton("Update", "update_price")])})
        }
    }
    
    public rednodes = async (ctx: UContext) =>  {
        let orange = ""
        let red = ""
        let n_orange = 0
        let n_red = 0
        let rednodes = this.alerts_handler.get_missing_delegates();
        rednodes.forEach((missed, pkey) => {
            const missing: Contracts.State.Wallet = this.wallets.findByPublicKey(pkey);
            let username = missing.getAttribute("delegate.username");
            if (missed == 1){
                n_orange +=1;
                orange += `\n${username} is orange`;
                if (ctx.user.delegates.some(delegate => delegate.username == username)){
                    orange += ` (+++YOU+++)`
                }else{
                    let voting_wallet = ctx.user.voters.filter((voter) =>{
                        let wallet = this.wallets.findByAddress(voter.address);
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
                let milestone = Managers.configManager.getMilestone(this.blockchain.getLastHeight());
                let days = (missed * milestone.blocktime * milestone.activeDelegates)/60/60/24;
                if (ctx.user.delegates.some(delegate => delegate.username == username)){
                    
                    red += `\n_+++YOU ARE RED+++ (${username})\n|___Missed blocks: ${missed} ~ ${Math.round(days)} day(s)`;
                }else{
                    red += `\n_${username} is red. `;
                    let voting_wallet = ctx.user.voters.filter((voter) =>{
                        let wallet = this.wallets.findByAddress(voter.address);
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
            let voter = voters[0];
            this.db.enter_menu(ctx.chat_id, ctx.user.states, "notifications/wallet/" + voter.address)
            ctx.reply(`REDNODES notify you when a ${this.get_delegate_name()} you are voting goes red.'
                '\nOUT OF FORGING notify you when the ${this.get_delegate_name()} you are voting become an active/standby ${this.get_delegate_name()} 
                '\nPAYMENTS notify you when you receive ${this.get_delegate_name()} in your wallet.`)
            ctx.reply('Choose the notification you want to turn on or off',  {reply_markup: Markup.keyboard(
                    [['Rednodes: ' + voter.Rednodes, "Out of Forging: " + voter.Out_of_forging],
                    ["Payments: " + voter.Transactions],
                    ["/Back"]])});        
        }
        else{
            this.db.enter_menu(ctx.chat_id, ctx.user.states, "notifications");
            let keyboard: any[] = [];
            let line: string[] = [];
            for (let r = 0; r < voters.length; r++){
                line.push(voters[r].name || voters[r].address);
                if (voters.length % 2){
                    keyboard.push(line);
                    line = [];
                }
            }
            if (line.length){
                keyboard.push(line);
            }
            line = ["/Back"]
            keyboard.push(line);

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
        ctx.reply("Write here your feedback",  {reply_markup: Markup.keyboard([["/Back"]])});
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
        let data;
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
        let line: string[] = [];
        for (let r = 0; r < data.length; r++){
            line.push(data[r].name || data[r].username || data[r].address);
            if ((r + 1) % 2){
                keyboard.push(line);
                line = [];
            }
        }
        if (line.length){
            keyboard.push(line);
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
        if (info === undefined || typeof info !== "string") info = "Links not set on config";
        else ctx.reply(info);
    }
    
    public delegates_info = async (ctx: UContext) =>  { 
        let message = "DELEGATES INFO:\n";
        let delegates = ctx.user.delegates;
        let i = 0;
        for (let delegate of delegates){
            i++;
            const current_height = this.blockchain.getLastHeight();
            const current_round: Contracts.Shared.RoundInfo = Utils.roundCalculator.calculateRound(current_height);
            let milestone = Managers.configManager.getMilestone(current_height);
            const wallet: Contracts.State.Wallet = this.wallets.findByUsername(delegate.username);
            const delegateAttribute = wallet.getAttribute("delegate");
            let username = delegateAttribute.username;
            let produced = delegateAttribute.producedBlocks;
            let rank = delegateAttribute.rank;

            this.dpos_state.buildDelegateRanking();
            
            const needed_delegates = this.dpos_state.getActiveDelegates().filter(delegate => {
                if (!(delegate.hasAttribute("delegate.rank"))) return false;
                let delegate_rank = delegate.getAttribute("delegate.rank");
                return (Math.abs(delegate_rank - rank) === 1 || delegate_rank === milestone.activeDelegates);
            })


            if (delegateAttribute.resigned && delegateAttribute.resigned == true){
                message += `(Resigned) ${username}\n`;
            }else{
                message += `(${rank}) ${username}\n`
                message += `VOTES: ${BigIntToString(delegateAttribute.voteBalance, 2)}(${Utils.delegateCalculator.calculateApproval(wallet)}%)\n`

                let minor_rank = needed_delegates.find(delegate => delegate.getAttribute("delegate.rank") - rank === 1);
                let greater_rank = needed_delegates.find(delegate => delegate.getAttribute("delegate.rank") - rank === -1);
                let forge_rank = needed_delegates.find(delegate => delegate.getAttribute("delegate.rank") === milestone.activeDelegates);
                if (rank <= milestone.activeDelegates){
                    message += `|_TO ${milestone.activeDelegates + 1}th: `;
                }else{
                    message += `|_TO ${milestone.activeDelegates}th: `;
                }
                if (forge_rank != undefined)
                    message += `${BigIntToString(forge_rank.getAttribute("delegate.voteBalance").minus(delegateAttribute.voteBalance), 2)}\n`
                if (minor_rank != undefined)
                    message += `|_TO -1: ${BigIntToString(minor_rank.getAttribute("delegate.voteBalance").minus(delegateAttribute.voteBalance), 2)}\n`
                if (greater_rank != undefined)
                    message += `|_TO +1: ${BigIntToString(greater_rank.getAttribute("delegate.voteBalance").minus(delegateAttribute.voteBalance), 2)}\n\n`

                
            }
            message += `Produced blocks: ${produced}\n`;

            if (delegateAttribute.lastBlock && rank <= milestone.activeDelegates) {
                let secondsToHms = (d: number) => {
                    var h = Math.floor(d / 3600);
                    var m = Math.floor(d % 3600 / 60);
                    var s = Math.floor(d % 3600 % 60);
                    
                    if (h > 0){
                        return h + (h == 1 ? " hour " : " hours ");
                    }else if (m > 0){
                        return m + (m == 1 ? " minute " : " minutes ");
                    }
                    return s + (s == 1 ? " second" : " seconds");
                }
                let last_block_height = delegateAttribute.lastBlock.height;
                message += `last block forged ${secondsToHms((current_height - last_block_height)*milestone.blocktime)} ago\n` +
                            `|_Height: ${last_block_height}\n|_Timestamp: ${Utils.formatTimestamp(delegateAttribute.lastBlock.timestamp).human}\n`
                const missed_blocks: Array<missed_block> = await this.db.get_missed_blocks(current_round.round - 1);
                let missed = missed_blocks.find(missed_bock => missed_bock.username === username);
                if (missed != undefined){
                    let block_missed = missed.consecutive;
                    message += `YOUR NODE IS RED\nYOUR ${this.get_delegate_name().toUpperCase()} HAS MISSED ${block_missed} BLOCKS SO FAR!\n`
                }

                message += `\nTotal forged: ${BigIntToString(delegateAttribute.forgedFees, 2)}\n` +
                            `|_Rewards: ${BigIntToString(delegateAttribute.forgedRewards, 2)}\n` +
                            `|_fees: ${BigIntToString(delegateAttribute.forgedFees.plus(delegateAttribute.forgedRewards), 2)}\n\n`
            }else{
                message += "\n"
            }

            if (i >= 5){
                ctx.reply(message); 
                message = ""; 
            }
        }
    
        ctx.reply(message, {reply_markup: Markup.inlineKeyboard([Markup.callbackButton("Update", "update_delegateinfo")])});    
    }
    
    public delegate_notifications = (ctx: UContext) => {
        
        let delegates = ctx.user.delegates;
        if (delegates.length < 2){
            let delegate = delegates[0];
            this.db.enter_menu(ctx.chat_id, ctx.user.states, "notifications/delegate/" + delegate.address)
            ctx.reply(`'REDNODE notify you when your ${this.get_delegate_name()} goes red. 
            \nPOSITION notify you of any rank change of your node and'
             when your node get in or out the forging ${this.get_delegate_name()}s.'
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
            let line: string[] = [];
            for (let r = 0; r < delegates.length; r++){
                line.push(delegates[r].username);
                if (delegates.length % 2){
                    keyboard.push(line);
                    line = [];
                }
            }
            if (line.length){
                keyboard.push(line);
            }
            line = ["/Back"]
            keyboard.push(line);

            ctx.reply("Which wallet do you want to change the notifications?",  {reply_markup: Markup.keyboard(keyboard)});

        } 
    }

    private get_delegate_name(): string {
        let config_delegate_name = this.configuration.get("delegate_name");
        if (config_delegate_name === undefined || typeof config_delegate_name !== "string") return "delegate";
        return config_delegate_name;
    }

    private get_symbol(){
        return Managers.configManager.get("network").client.symbol;
    }
}