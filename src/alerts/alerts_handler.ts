import { Container, Contracts, Enums, Utils, Providers } from "@arkecosystem/core-kernel";
import { Managers } from "@arkecosystem/crypto";
import { Repositories } from "@arkecosystem/core-database";
import { Telegram, Extra } from "telegraf";
import { BigIntToBString } from "../Utils/utils";

@Container.injectable()
export class alerts_handler{
    @Container.inject(Container.Identifiers.LogService)
    private readonly logger!: Contracts.Kernel.Logger;

    @Container.inject(Container.Identifiers.EventDispatcherService)
    private readonly events!: Contracts.Kernel.EventDispatcher;

    @Container.inject(Container.Identifiers.DposState)
    private readonly delegates!: Contracts.State.DposState;

    @Container.inject(Container.Identifiers.BlockchainService)
    private readonly blockchain!: Contracts.Blockchain.Blockchain;
    
    @Container.inject(Container.Identifiers.WalletRepository)
    @Container.tagged("state", "blockchain")
    private readonly wallets!: Contracts.State.WalletRepository;

    @Container.inject(Container.Identifiers.DatabaseRoundRepository)
    private readonly roundRepository!: Repositories.RoundRepository;

    @Container.inject(Container.Identifiers.DatabaseBlockRepository)
    private readonly blockRepository!: Repositories.BlockRepository;

    @Container.inject(Symbol.for("display_transactions"))
    private readonly display_transactions;

    @Container.inject(Symbol.for("database"))
    private readonly db;

    @Container.inject(Container.Identifiers.PluginConfiguration)
    @Container.tagged("plugin", "@cactus1549/ark-monitor")
    private readonly configuration!: Providers.PluginConfiguration;

    
    
    private bot;
    private network = Managers.configManager.get("network");

    private LAST_BLOCK_DELEGATES: Array<any> = [];
    private transactions_queue: Array<any> = [];

    public missing_delegates;


    public async start(){
        this.missing_delegates = new Map<string, number>();
        await this.init();
        const token: string | undefined = this.configuration.get("telegram_token");
        if (!token){ this.logger.error("Token not set. The bot will not send out notifications."); return; }
        this.bot = new Telegram(token);




        this.delegates.buildDelegateRanking();
        this.LAST_BLOCK_DELEGATES = this.delegates.getActiveDelegates().map(delegate => {
            const pkey = delegate.getPublicKey();
            let del = delegate.getAttribute("delegate");
            del.publicKey = pkey;
            return del;
        });
        this.events.listen(Enums.BlockEvent.Applied, {
            handle: async (data) => {
                this.delegates.buildDelegateRanking();
                const new_block_delegates = this.delegates.getActiveDelegates().map(delegate => {
                    const pkey = delegate.getPublicKey();
                    let del = delegate.getAttribute("delegate");
                    del.publicKey = pkey;
                    return del;
                });
                const old_delegates = this.LAST_BLOCK_DELEGATES.map(obj => ({...obj}));
                this.LAST_BLOCK_DELEGATES = new_block_delegates.map(obj => ({...obj}));
                this.process_new_block(new_block_delegates, old_delegates , data.data);

                const producer: string = data.data.generatorPublicKey;
                const delegate: Contracts.State.Wallet = this.wallets.findByPublicKey(producer);
                const username = delegate.getAttribute("delegate.username");
                if (this.missing_delegates.has(producer)){
                    const consecutive = this.missing_delegates.get(producer);
                    this.missing_delegates.delete(producer);
                    const delegate_chat = await this.db.get_all_delegates_Missing(username);

                    const voter_list = await this.db.get_all_voters_Rednodes();
                    for (let chat of delegate_chat){
                        this.bot.sendMessage(chat.chat_id, `${username} is Green again. \nMissed blocks: ${consecutive}`);
                    }
                    for (let voter of voter_list){
                        let wallet: Contracts.State.Wallet = this.wallets.findByAddress(voter.address);
                        if (wallet.hasVoted() && wallet.getAttribute("vote") == producer){
                            this.bot.sendMessage(voter.chat_id, `${username} (voted by ${voter.address}) is green again. \nMissed blocks: ${consecutive}`);
                        }
                    }  
                }
            },
        });

        this.events.listen(Enums.TransactionEvent.Applied, {
            handle: async (data) => {
                
                this.transactions_queue.push(data.data);

                const transaction =  data.data;
                const sender_p_key = transaction.senderPublicKey;
                const wallet: Contracts.State.Wallet = this.wallets.findByPublicKey(sender_p_key);
                let addresses: string[] = [wallet.getAddress()];
                if (transaction.typeGroup === 1 && transaction.type === 6){
                    transaction.asset.payments.forEach(element => {
                        const address = element.recipientId;
                        if (!addresses.includes(address)) addresses.push(address);
                    });
                }else{
                    if (transaction.recipientId && !addresses.includes(transaction.recipientId)) addresses.push(transaction.recipientId);
                }
                for (let address of addresses){
                    let alerts = await this.db.get_voter_by_address_and_transaction(address);
                    for (let alert of alerts){
                        this.bot.sendMessage(alert.chat_id, `NEW TRANSACTION\n${await this.display_transactions.display(transaction, alert.address, alert.chat_id)}`, Extra.HTML());
                    }
                }
                

            },
        });

        this.events.listen(Enums.RoundEvent.Missed, {
            handle: async (data) => {
                const delegate: Contracts.State.Wallet = data.data.delegate;
                const username = delegate.getAttribute("delegate.username");
                const pkey = delegate.getPublicKey();
                if (pkey !== undefined){
                    let consecutive = 1;
                    if (this.missing_delegates.has(delegate.getPublicKey()!)) {
                        consecutive = this.missing_delegates.get(delegate.getPublicKey()!)! + 1;
                        this.missing_delegates.set(delegate.getPublicKey()!, consecutive);
                    }
                    else this.missing_delegates.set(delegate.getPublicKey()!, 1);

                    const delegate_chat = await this.db.get_all_delegates_Missing(username);

                    const voter_list = await this.db.get_all_voters_Rednodes();
                        
                    if (consecutive === 1){
                        for (let chat of delegate_chat){
                            this.bot.sendMessage(chat.chat_id, `${username} is Orange`);
                        }
                        for (let voter of voter_list){
                            const wallet: Contracts.State.Wallet = this.wallets.findByAddress(voter.address);
                            if (wallet.hasVoted() && wallet.getAttribute("vote") == pkey){
                                this.bot.sendMessage(voter.chat_id, `${username} (voted by ${voter.address}) is Orange`);
                            }
                        }
                    }else if (consecutive === 2){
                        for (let chat of delegate_chat){
                            this.bot.sendMessage(chat.chat_id, `${username} is Red\nMissed blocks: ${consecutive}`);
                        }
                        for (let voter of voter_list){
                            let wallet: Contracts.State.Wallet = this.wallets.findByAddress(voter.address);
                            if (wallet.hasVoted() && wallet.getAttribute("vote") == pkey){
                                this.bot.sendMessage(voter.chat_id, `${username} (voted by ${voter.address}) is Red\nMissed blocks: ${consecutive}`);
                            }
                        }
                    }else if (consecutive % 18 === 0){
                        for (let chat of delegate_chat){
                            this.bot.sendMessage(chat.chat_id, `${username} is Red\nMissed blocks: ${consecutive}`);
                        }
                    }else if (consecutive % 212 === 0){
                        for (let voter of voter_list){
                            let wallet: Contracts.State.Wallet = this.wallets.findByAddress(voter.address);
                            if (wallet.hasVoted() && wallet.getAttribute("vote") == pkey){
                                this.bot.sendMessage(voter.chat_id, `${username} (voted by ${voter.address}) is Red\nMissed blocks: ${consecutive}`);
                            }
                        }
                    }
                }
            },
        });
    }


    private async process_new_block(new_delegates: Array<any>, old_delegates: Array<any>, block: any){    

        const delegates_difference: Array<any> = new_delegates.map(element => {
            const last_block_delegate: any = old_delegates.find(o => {return o.username === element.username});
            if (last_block_delegate !== undefined){
                element.votediff = element.voteBalance.minus(last_block_delegate.voteBalance);
                element.rankdiff = element.rank - last_block_delegate.rank;                
            }
            else{
                element.votediff = Utils.BigNumber.ZERO;
                element.rankdiff = 0;
            }
            return element;
        }).filter((element) => {return (!(element.votediff.isZero()) || element.rankdiff != 0)});
        this.logger.debug("------------------------------------");
        if (delegates_difference.length > 0){
            const transactions = await this.get_block_transactions(block.height);
            const filtered_transactions = transactions.map((trans) => {
                if (trans.typeGroup == 1 && trans.type == 3){
                    return trans;
                }

                let valid:Boolean = false;
                const sender = this.wallets.findByPublicKey(trans.senderPublicKey);
                if (sender.hasVoted()){
                    valid = true;
                    const delegate: Contracts.State.Wallet = this.wallets.findByPublicKey(sender.getAttribute("vote"));
                    trans.sendervote = delegate.getAttribute("delegate.username");
                }
                if (trans.typeGroup == 1 && trans.type == 6){
                    let recipients = trans.asset.payments;
                    trans.asset.payments = recipients.map((o) => {
                        const single_recipient = this.wallets.findByAddress(o.recipientId);
                        if (single_recipient.hasVoted()){
                            valid = true;
                            const delegate: Contracts.State.Wallet = this.wallets.findByPublicKey(single_recipient.getAttribute("vote"));
                            o.vote = delegate.getAttribute("delegate.username");
                        }
                        return o;
                    })
                }
                else {
                    let recipient = this.wallets.findByAddress(trans.recipientId);
                
                
                    if (recipient.hasVoted() && recipient.getAddress() !== sender.getAddress()){
                        valid = true;
                        const delegate: Contracts.State.Wallet = this.wallets.findByPublicKey(recipient.getAttribute("vote"));
                        trans.recipientvote = delegate.getAttribute("delegate.username");
                    }
                }
                
                if (valid){
                    return trans;
                }
            })
            const result = delegates_difference.map((wallet) => {
                wallet.transactions = filtered_transactions.filter(o => {
                    if (o === undefined){
                        return false;
                    }
                    else if (o.typeGroup == 1 && o.type == 3){
                        return (o.asset.votes.includes("+" + wallet.publicKey) !== o.asset.votes.includes("-" + wallet.publicKey));
                    }else if (o.typeGroup == 1 && o.type == 6){
                        return (wallet.username === o.sendervote) || (o.asset.payments.filter((o) => { return (o.vote === wallet.username && o.vote !== o.sendervote)}).length > 0);
                    }else if (o.typeGroup == 1 && o.type == 0){
                        return ((wallet.username === o.sendervote ||  wallet.username === o.recipientvote) && o.sendervote !== o.recipientvote);
                    }
                    return false;
                }).flatMap(transaction => {
                    let type;
                    let sender;
                    let recipient: string | undefined = undefined;
                    let amount = Utils.BigNumber.ZERO;
                    let id = transaction.id;
                    if (transaction.typeGroup == 1 && transaction.type == 3){
                        const sender_wallet: Contracts.State.Wallet = this.wallets.findByPublicKey(transaction.senderPublicKey);
                        sender = sender_wallet.getAddress();
                        amount = sender_wallet.balance;
                        if (transaction.asset.votes.includes("+" + wallet.publicKey)){
                            type = 1;
                        }else{
                            type = 2;
                        }
                    }else if (transaction.typeGroup == 1 && transaction.type == 6){
                        let multi_transactions: any[] = [];
                        sender = transaction.recipientId;
                        if (wallet.username === transaction.sendervote){
                            type = 3
                            for (let recipient of transaction.asset.payments){
                                if (recipient.vote !== transaction.sendervote) amount.plus(recipient.amount);
                            }
                            recipient = `Multipay (${transaction.asset.payments.length})`
                        }else {
                            type = 4
                            for (let recipient of transaction.asset.payments){
                                if (recipient.vote === wallet.username) multi_transactions.push({id, type, sender, recipient: recipient.recipientId, amount: recipient.amount});
                            }
                            return multi_transactions;
                        }
                    }else if (transaction.typeGroup == 1 && transaction.type == 0){
                        sender = transaction.recipientId;
                        const d_wallet: Contracts.State.Wallet = this.wallets.findByPublicKey(transaction.senderPublicKey);
                        recipient = d_wallet.getAddress();
                        amount = transaction.amount;
                        if (wallet.username === transaction.sendervote) type = 3;
                        else type = 4;
                    }
                    return {id, type, sender, recipient, amount};
                });
                return wallet;
            })

            const current_height = this.blockchain.getLastHeight();
            let milestone = Managers.configManager.getMilestone(current_height);


            
            for (let delegate of result){
                const chat_id_list = await this.db.get_delegates_from_username(delegate.username);
                let message = `Delegate: ${delegate.username}\n`;
                const delta_rank = delegate.rankdiff;
                const new_rank = delegate.rank;
                const old_rank = new_rank - delta_rank;
                const delta_votes = delegate.votediff;
                this.logger.debug(delegate.username);
                this.logger.debug(delta_rank);
                this.logger.debug(new_rank);
                this.logger.debug(old_rank);
                this.logger.debug(delta_votes);
                const change_voters = delegate.transactions.some(o => o.type == 1 || o.type == 2);

                if (delta_rank < 0) message += `Rank: ${old_rank} --(+${Math.abs(delta_rank)})--> ${new_rank}\n`
                else if (delta_rank > 0) message += `Rank: ${old_rank} --(-${Math.abs(delta_rank)})--> ${new_rank}\n`
                else message += `Rank remain the same (${old_rank})\n`

                if (delta_votes.isNegative())  message += `You lost ${this.network.client.token} ${BigIntToBString(delta_votes.times(-1), 0)} votes\n`
                else if (delta_votes.isGreaterThan(0)) message += `You got ${this.network.client.token} ${BigIntToBString(delta_votes, 0)} votes\n`
                else message += "Votes remain the same.\n"

                if (old_rank <= milestone.activeDelegates && milestone.activeDelegates < new_rank) {
                    message += "\n\nYOU ARE NOW A STANDBY DELEGATE AND YOU ARE NOT FORGING ANYMORE\n\n"

                    let voter_list = await this.db.get_all_voters_outForging();
                    for (let voter of voter_list){
                        let wallet: Contracts.State.Wallet = this.wallets.findByAddress(voter.address);
                        if (wallet.hasVoted() && wallet.getAttribute("vote") == delegate.publicKey){
                            this.bot.sendMessage(voter.chat_id, `Delegate ${delegate.username} (voted by ${voter.address}) is out from the forging delegates!\nNew Rank: ${new_rank}.`);
                        }
                    }

                    if (this.missing_delegates.has(delegate.publicKey)){
                        const consecutive = this.missing_delegates.get(delegate.publicKey);
                        this.missing_delegates.delete(delegate.publicKey);
                        const delegate_chat = await this.db.get_all_delegates_Missing(delegate.username);
    
                        const voter_list = await this.db.get_all_voters_Rednodes();
                        for (let chat of delegate_chat){
                            this.bot.sendMessage(chat.chat_id, `${delegate.username} is out because he was read. \nMissed blocks: ${consecutive}`);
                        }
                        for (let voter of voter_list){
                            let wallet: Contracts.State.Wallet = this.wallets.findByAddress(voter.address);
                            if (wallet.hasVoted() && wallet.getAttribute("vote") == delegate.username){
                                this.bot.sendMessage(voter.chat_id, `${delegate.username} (voted by ${voter.address}) is out because he was red. \nMissed blocks: ${consecutive}`);
                            }
                        }  
                    }
                }
                else if (old_rank > milestone.activeDelegates && milestone.activeDelegates >= new_rank) {
                    message += "\n\nYOU ARE NOW ON A FORGING POSITION!\n\n"

                    let voter_list = await this.db.get_all_voters_outForging();
                    for (let voter of voter_list){
                        let wallet: Contracts.State.Wallet = this.wallets.findByAddress(voter.address);
                        if (wallet.hasVoted() && wallet.getAttribute("vote") == delegate.publicKey){
                            this.bot.sendMessage(voter.chat_id, `Delegate ${delegate.username} (voted by ${voter.address}) is now in a forging position!\nNew Rank: ${new_rank}.`);
                        }
                    }
                }
                

                if (chat_id_list.length <= 0) continue;
                message += "REASONS:\n"

                if (delegate.transactions.length){
                    const sortedTransaction = delegate.transactions.sort((trans1, trans2) => {
                        if (trans1.amount.isGreaterThan(trans2.amount)) return 1;
                            if (trans1.amount.isLessThan(trans2.amount)) return -1;
                        return 0;
                    });
                    for (let trans of sortedTransaction.slice(0, 5)){
                        const amount = `${this.network.client.token} ${BigIntToBString(trans.amount, 2)}`
                        const sender_string = `<a href="${this.network.client.explorer}/wallets/${trans.sender}">${trans.sender}</a>`
                        const recipient_string = `<a href="${this.network.client.explorer}/wallets/${trans.recipient}">${trans.recipient}</a>`
                        if (trans.type == 1){
                            message += `- ${sender_string} voted you with a weight of ${amount}\n`
                        }else if (trans.type == 2){
                            message += `- ${sender_string} unvoted you with a weight of ${amount}\n`
                        }else if (trans.type == 3){
                            message += `- ${sender_string} sent ${amount} to ${recipient_string}\n`
                        }else if (trans.type == 4){
                            message += `- ${sender_string} received ${amount} from ${recipient_string}\n`
                        }
                        message += `<a href="${this.network.client.explorer}/transaction/${trans.id}">View on explorer</a>\n`
                    }
                }

                if (delta_rank !== 0){
                    let new_message = "";
                    for (let other_delegate of result){
                        const dele_username = other_delegate.username;
                        if (dele_username === delegate.username || other_delegate.transactions.length === 0) continue;
                        const dele_new_rank = other_delegate.rank;
                        const dele_old_rank = dele_new_rank - other_delegate.rankdiff;

                        new_message += dele_username;

                        if (dele_old_rank > old_rank && dele_new_rank < new_rank) new_message += " got over you:\nReasons:\n"
                        else if (dele_old_rank < old_rank && dele_new_rank > new_rank) new_message += " dropped below you:\nReasons:\n";
                        else continue;
                        const other_sortedTransaction = other_delegate.transactions.sort((trans1, trans2) => {
                            if (trans1.amount.isGreaterThan(trans2.amount)) return 1;
                            if (trans1.amount.isLessThan(trans2.amount)) return -1;
                            return 0;
                        });
                        let n_iterations = 0;


                        for (let trans of other_sortedTransaction){
                            const amount = `${this.network.client.token} ${BigIntToBString(trans.amount, 2)}`
                            const sender_string = `<a href="${this.network.client.explorer}/wallets/${trans.sender}">${trans.sender}</a>`
                            if (dele_old_rank < old_rank && dele_new_rank > new_rank){
                                if (trans.type == 2){
                                    new_message += `- ${sender_string} unvoted ${dele_username} with a weight of ${amount}\n`
                                    new_message += `<a href="${this.network.client.explorer}/transaction/${trans.id}">View on explorer</a>\n`
                                    n_iterations += 1;
                                }else if (trans.type == 3){
                                    let recipient_string = `<a href="${this.network.client.explorer}/wallets/${trans.recipient}">${trans.recipient}</a>`
                                    new_message += `- ${sender_string} that is voting for ${dele_username} sent ${amount} to ${recipient_string}\n`
                                    new_message += `<a href="${this.network.client.explorer}/transaction/${trans.id}">View on explorer</a>\n`
                                    n_iterations += 1;
                                }                            
                                
                            }
                            else if (dele_old_rank > old_rank && dele_new_rank < new_rank){
                                if (trans.type == 1){
                                    new_message += `- ${sender_string} voted ${dele_username} with a weight of ${amount}\n`
                                    new_message += `<a href="${this.network.client.explorer}/transaction/${trans.id}">View on explorer</a>\n`
                                    n_iterations += 1;
                                }else if (trans.type == 4){
                                    let recipient_string = `<a href="${this.network.client.explorer}/wallets/${trans.recipient}">${trans.recipient}</a>`
                                    new_message += `- ${recipient_string} that is voting for ${dele_username} received ${amount} from ${sender_string}\n`
                                    new_message += `<a href="${this.network.client.explorer}/transaction/${trans.id}">View on explorer</a>\n`
                                    n_iterations += 1;
                                }
                                
                            }
                            if (n_iterations >= 3) break;
                        }

                        this.logger.info("++++++++++++++++++++++++++++++++++++++++++++++++++++++++++")

                        if (new_message != "" && (message + new_message).length >= 4000){
                            for (let chat of chat_id_list){
                                if (((chat.Votes !== "OFF" && (delta_votes.isLessThan(new Utils.BigNumber(Number(chat.Votes)).times(-100000000)) || delta_votes.isGreaterThan(new Utils.BigNumber(Number(chat.Votes)).times(100000000)))) || (chat.Position === "ON" &&  Math.abs(delta_rank) > 0) || (change_voters && chat.Voters == "ON")))
                                    this.bot.sendMessage(chat.chat_id, message, Extra.HTML());
            
                            }
                            message = new_message
                        }else {
                            message += new_message
                        }   
                    }

                                                          

                }
                if (message != ""){
                    for (let chat of chat_id_list){
                        if (((chat.Votes !== "OFF" && (delta_votes.isLessThan(new Utils.BigNumber(Number(chat.Votes)).times(-100000000)) || delta_votes.isGreaterThan(new Utils.BigNumber(Number(chat.Votes)).times(100000000)))) || (chat.Position === "ON" &&  Math.abs(delta_rank) > 0) || (change_voters && chat.Voters == "ON")))
                            this.bot.sendMessage(chat.chat_id, message, Extra.HTML());
    
                    }
                }
                
                


            }
            //result.forEach(data => {this.logger.info(data.username);this.logger.info(data.votediff);this.logger.info(data.rankdiff);this.logger.info(data.transactions);})
        }
    }

    private get_block_transactions = async (id:number) => {
        const temp = this.transactions_queue.filter((o) => o.blockHeight == id);
        this.transactions_queue = this.transactions_queue.filter((o) => o.blockHeight > id);
        return temp;
    }

    private init = async () => {
        this.logger.info("Missed block calculation started")
        const current_height = this.blockchain.getLastHeight();
        const round = Utils.roundCalculator.calculateRound(current_height).round;

        const milestone = Managers.configManager.getMilestone(current_height);
        const number_delegates = milestone.activeDelegates;

        let current_round = round - 1;

        let missing = true;
        while (missing){
            missing = false;

            const delegates = await this.roundRepository.findById(current_round.toString());
            const blocks = await this.blockRepository.findByHeightRange(((current_round - 1) * number_delegates) + 1, current_round * number_delegates);


            delegates.forEach(delegate => {
                if (!(current_round === round - 1 || this.missing_delegates.has(delegate.publicKey))) return;
                const missed = !blocks.some(block => {
                    return delegate.publicKey === block.generatorPublicKey;
                })
                if (missed) {
                    missing = true;
                    if (this.missing_delegates.has(delegate.publicKey)) this.missing_delegates.set(delegate.publicKey, this.missing_delegates.get(delegate.publicKey)! + 1);
                    else this.missing_delegates.set(delegate.publicKey, 1);
                }               
            });
            current_round -=1;
        }
        this.logger.debug("CALCULATION MISSED BLOCKS FINISHED")
    }

    public get_missing_delegates = () => {

        return this.missing_delegates;
    }
}