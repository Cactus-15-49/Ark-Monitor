import { Container, Contracts, Enums, Providers, Utils as AppUtils} from "@solar-network/kernel";
import { Managers, Utils, Interfaces } from "@solar-network/crypto";
import { Repositories } from "@solar-network/database";
import { Telegram, Extra } from "telegraf";
import { BigIntToBString } from "../utils/utils";
import { simplified_transaction, TransactionsTypes } from "../interfaces";

@Container.injectable()
export class alerts_handler{

    @Container.inject(Container.Identifiers.LogService)
    private readonly logger!: Contracts.Kernel.Logger;

    @Container.inject(Container.Identifiers.EventDispatcherService)
    private readonly events!: Contracts.Kernel.EventDispatcher;

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

        this.LAST_BLOCK_DELEGATES = this.getDelegateRankList().map(delegate => {
            const pkey = delegate.getPublicKey();
            let del = {...delegate.getAttribute("delegate")};
            del.publicKey = pkey;
            return del;
        });
        this.events.listen(Enums.BlockEvent.Applied, {
            handle: async (data) => {
                const new_block_delegates = this.getDelegateRankList().map(delegate => {
                    const pkey = delegate.getPublicKey();
                    let del = {...delegate.getAttribute("delegate")};
                    del.publicKey = pkey;
                    return del;
                });
                const old_delegates = this.LAST_BLOCK_DELEGATES.map(obj => ({...obj}));
                this.LAST_BLOCK_DELEGATES = new_block_delegates.map(obj => ({...obj}));
                this.process_new_block(new_block_delegates.map(obj => ({...obj})), old_delegates , data.data);

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
                        if (wallet.hasVoted() && wallet.getVoteBalance(username) !== undefined){
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
                    transaction.asset.transfers.forEach(element => {
                        const address = element.recipientId;
                        if (!addresses.includes(address)) addresses.push(address);
                    });
                }else{
                    if (transaction.recipientId && !addresses.includes(transaction.recipientId)) addresses.push(transaction.recipientId);
                }
                for (let address of addresses){
                    let alerts = await this.db.get_voter_by_address_and_transaction(address);
                    for (let alert of alerts){
                        this.bot.sendMessage(alert.chat_id, `NEW TRANSACTION\n${await this.display_transactions.display(transaction, alert.address, alert.chat_id)}`, Extra.webPreview(false).HTML());
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
                            if (wallet.hasVoted() && wallet.getVoteBalance(username) !== undefined){
                                this.bot.sendMessage(voter.chat_id, `${username} (voted by ${voter.address}) is Orange`);
                            }
                        }
                    }else if (consecutive === 2){
                        for (let chat of delegate_chat){
                            this.bot.sendMessage(chat.chat_id, `${username} is Red\nMissed blocks: ${consecutive}`);
                        }
                        for (let voter of voter_list){
                            let wallet: Contracts.State.Wallet = this.wallets.findByAddress(voter.address);
                            if (wallet.hasVoted() && wallet.getVoteBalance(username) !== undefined){
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
                            if (wallet.hasVoted() && wallet.getVoteBalance(username) !== undefined){
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
        }).filter((element) => {return (!(element.votediff.isZero()) || element.rankdiff !== 0)});
        this.logger.debug("------------------------------------");
        if (delegates_difference.length > 0){
            const transactions = this.get_block_transactions(block.height);
            console.log(`transactions : ${JSON.stringify(transactions)}`);
            const normalized_transactions = transactions.flatMap((trans) => {

                const sender = this.wallets.findByPublicKey(trans.senderPublicKey);

                const transaction: simplified_transaction = {
                    type: TransactionsTypes.vote,
                    id: trans.id!,
                    sender: sender.getAddress(),
                    recipient: undefined,
                    amount: trans.amount,
                    delegates: []
                };
                
                const senderVote = sender.getVoteDistribution();
                console.log(`senderVote : ${JSON.stringify(senderVote)}`);
                if (trans.typeGroup === 1 && trans.type === 3){
                    transaction.amount = sender.getBalance();
                    const votes = trans.asset!.votes as string[];
                    for (const vote of votes) {
                        const delegate = vote.substring(1).length > 21 ? this.wallets.findByPublicKey(vote.substring(1)) : this.wallets.findByAddress(vote.substring(1));
                        transaction.delegates.push({delegate: delegate.getAttribute("delegate.username"), amount: vote[0] === "+" ? transaction.amount : -transaction.amount})
                    }
                    if (transaction.delegates[0].delegate === transaction.delegates[1].delegate) {
                        transaction.delegates = [];
                    }
                    return transaction;
                }else if (trans.typeGroup === 1 && trans.type === 6){
                    const multi_transactions: simplified_transaction[] = [];
                    transaction.type = TransactionsTypes.transfer;

                    
                    for (const transfer of trans.asset!.transfers!) {
                        transaction.delegates = [];
                        transaction.amount = transfer.amount;
                        transaction.recipient = transfer.recipientId;
                        for (const delegate of Object.keys(senderVote)) {
                            transaction.delegates.push({delegate, amount: transaction.amount.times(-senderVote[delegate].percent*100).dividedBy(10000)})
                        }
                        const recipient = this.wallets.findByAddress(transaction.recipient);
                        const recipientVote = recipient.getVoteDistribution();
                        for (const delegate of Object.keys(recipientVote)) {
                            if (transaction.delegates.find(del => del.delegate === delegate)) {
                                transaction.delegates = transaction.delegates.map(del => {
                                    if (del.delegate === delegate) return {delegate: del.delegate, amount: del.amount.plus(transaction.amount.times(recipientVote[delegate].percent*100).dividedBy(10000))};
                                    return del;
                                })
                            } else {
                                transaction.delegates.push({delegate, amount: transaction.amount.times(recipientVote[delegate].percent*100).dividedBy(10000)}); 
                            }
                        }
                        transaction.delegates = transaction.delegates.filter(del => !del.amount.isZero());
                        if (transaction.delegates.length) {
                            multi_transactions.push({...transaction});
                        }
                    }
                    return multi_transactions;
                }else if (trans.typeGroup === 1 && trans.type === 0){
                    transaction.type = TransactionsTypes.transfer;

                    transaction.delegates = [];
                    transaction.recipient = trans.recipientId;
                    for (const delegate of Object.keys(senderVote)) {
                        transaction.delegates.push({delegate, amount: transaction.amount.times(-senderVote[delegate].percent*100).dividedBy(10000)})
                    }
                    const recipient = this.wallets.findByAddress(transaction.recipient!);
                    const recipientVote = recipient.getVoteDistribution();
                    for (const delegate of Object.keys(recipientVote)) {
                        if (transaction.delegates.find(del => del.delegate === delegate)) {
                            transaction.delegates = transaction.delegates.map(del => {
                                if (del.delegate === delegate) return {delegate: del.delegate, amount: del.amount.plus(transaction.amount.times(recipientVote[delegate].percent*100).dividedBy(10000))};
                                return del;
                            })
                        } else {
                            transaction.delegates.push({delegate, amount: transaction.amount.times(recipientVote[delegate].percent*100).dividedBy(10000)}); 
                        }
                    }
                    transaction.delegates = transaction.delegates.filter(del => !del.amount.isZero());
                    if (transaction.delegates.length) {
                        return transaction;
                    }

                    return undefined;
                }else if (trans.typeGroup === 2 && trans.type === 0){
                    transaction.type = TransactionsTypes.burn;

                    transaction.delegates = [];
                    for (const delegate of Object.keys(senderVote)) {
                        transaction.delegates.push({delegate, amount: transaction.amount.times(-senderVote[delegate].percent*100).dividedBy(10000)})
                    }
                    if (transaction.delegates.length) {
                        return transaction;
                    }

                    return undefined;
                }else if (trans.typeGroup === 2 && trans.type === 2) {
                    transaction.amount = sender.getBalance();
                    const newVotes = trans.asset!.votes!;
                    const oldVotes = sender.getAllStateHistory().votes.at(-2);
                    const allDelegates = Object.keys(oldVotes).concat(Object.keys(newVotes).filter((item) => Object.keys(oldVotes).indexOf(item) < 0));
                    for (const delegate of allDelegates) {
                        const diff = transaction.amount.times((newVotes[delegate] | 0)*100).minus(transaction.amount.times((oldVotes[delegate] | 0)*100)).dividedBy(10000);
                        transaction.delegates.push({delegate, amount: diff});
                    }
                    return transaction;
                }

                return undefined;
            }).filter(o => o !== undefined);

            console.log(`Normalized : ${JSON.stringify(normalized_transactions)}`);

            const result = delegates_difference.map((wallet) => {
                wallet.transactions = normalized_transactions.filter(o => o!.delegates.find(delegate => wallet.username === delegate.delegate));
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
                const new_votes = delegate.voteBalance;
                const old_votes = new_votes.minus(delta_votes);
                this.logger.debug(delegate.username);
                this.logger.debug(delta_rank);
                this.logger.debug(new_rank);
                this.logger.debug(old_rank);
                this.logger.debug(delta_votes);
                const change_voters = delegate.transactions.some(o => o.type === TransactionsTypes.vote );

                if (delta_rank < 0) message += `Rank: ${old_rank} --(+${Math.abs(delta_rank)})--> ${new_rank}\n`
                else if (delta_rank > 0) message += `Rank: ${old_rank} --(-${Math.abs(delta_rank)})--> ${new_rank}\n`
                else message += `Rank remains the same (${old_rank})\n`


                if (delta_votes.isNegative()) message += `Votes: ${BigIntToBString(old_votes,0)} --(-${BigIntToBString(delta_votes.times(-1), 0)})--> ${BigIntToBString(new_votes,0)}\n`
                else if (delta_votes.isGreaterThan(0)) message += `Votes: ${BigIntToBString(old_votes,0)} --(+${BigIntToBString(delta_votes, 0)})--> ${BigIntToBString(new_votes,0)}\n`
                else message += `Votes remain the same (${BigIntToBString(new_votes,0)})\n`

                if (old_rank <= milestone.activeDelegates && milestone.activeDelegates < new_rank) {
                    message += "\n\nYOU ARE NOW A STANDBY DELEGATE AND YOU ARE NOT FORGING ANYMORE\n\n"

                    let voter_list = await this.db.get_all_voters_outForging();
                    for (let voter of voter_list){
                        let wallet: Contracts.State.Wallet = this.wallets.findByAddress(voter.address);
                        if (wallet.hasVoted() && wallet.getVoteBalance(delegate.username) !== undefined){
                            this.bot.sendMessage(voter.chat_id, `Delegate ${delegate.username} (voted by ${voter.address}) is out from the forging delegates!\nNew Rank: ${new_rank}.`);
                        }
                    }

                    if (this.missing_delegates.has(delegate.publicKey)){
                        const consecutive = this.missing_delegates.get(delegate.publicKey);
                        const delegate_chat = await this.db.get_all_delegates_Missing(delegate.username);
    
                        const voter_list = await this.db.get_all_voters_Rednodes();
                        for (let chat of delegate_chat){
                            this.bot.sendMessage(chat.chat_id, `${delegate.username} is out because he was red. \nMissed blocks: ${consecutive}`);
                        }
                        for (let voter of voter_list){
                            let wallet: Contracts.State.Wallet = this.wallets.findByAddress(voter.address);
                            if (wallet.hasVoted() && wallet.getVoteBalance(delegate.username) !== undefined){
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
                        if (wallet.hasVoted() && wallet.getVoteBalance(delegate.username) !== undefined){
                            this.bot.sendMessage(voter.chat_id, `Delegate ${delegate.username} (voted by ${voter.address}) is now in a forging position!\nNew Rank: ${new_rank}.`);
                        }
                    }
                }
                

                if (chat_id_list.length <= 0) continue;
                message += "REASONS:\n"
                let hasReasons = false;
                if (delegate.transactions.length){
                    hasReasons = true;
                    console.log(`aaaaaaaaaaaaaaaaaaaaa: ${JSON.stringify(delegate.transactions)}`);
                    const sortedTransaction = delegate.transactions.sort((trans1, trans2) => {
                        console.log(`trans1: ${JSON.stringify(trans1)}`)
                        console.log(`trans2: ${JSON.stringify(trans2)}`)
                        if (trans1.amount.isGreaterThan(trans2.amount)) return -1;
                        if (trans1.amount.isLessThan(trans2.amount)) return 1;
                        return 0;
                    });
                    for (let trans of sortedTransaction.slice(0, 5)){
                        const amount = trans.delegates.find(del => del.delegate === delegate.username).amount;
                        const amount_string = `${BigIntToBString(amount.isNegative() ? amount.times(-1) : amount, 8)} ${this.network.client.token}`
                        const sender_string = `<a href="${this.network.client.explorer}/wallets/${trans.sender}">${trans.sender}</a>`
                        const recipient_string = trans.recipient ? `<a href="${this.network.client.explorer}/wallets/${trans.recipient}">${trans.recipient}</a>` : "";
                        if (trans.type === TransactionsTypes.vote && amount.isGreaterThan(0)){
                            message += `- ${sender_string} voted you with a weight of ${amount_string}\n`
                        }else if (trans.type === TransactionsTypes.vote && amount.isLessThan(0)){
                            message += `- ${sender_string} unvoted you with a weight of ${amount_string}\n`
                        }else if (trans.type === TransactionsTypes.transfer && amount.isLessThan(0)){
                            message += `- ${sender_string} sent ${amount_string} to ${recipient_string}\n`
                        }else if (trans.type === TransactionsTypes.transfer && amount.isGreaterThan(0)){
                            message += `- ${recipient_string} received ${amount_string} from ${sender_string}\n`
                        }else if (trans.type === TransactionsTypes.burn) {
                            message += `- ${sender_string} burned ${amount_string}\n`
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

                        if (dele_old_rank > old_rank && dele_new_rank < new_rank) new_message += `${dele_username} got over you:\nReasons:\n`;
                        else if (dele_old_rank < old_rank && dele_new_rank > new_rank) new_message += `${dele_username} dropped below you:\nReasons:\n`;
                        else continue;
                        hasReasons = true;
                        console.log(`bbbbbbbbbbbbbbbbbbbbbb: ${JSON.stringify(other_delegate.transactions)}`);
                        const other_sortedTransaction = other_delegate.transactions.sort((trans1, trans2) => {
                            if (trans1.amount.isGreaterThan(trans2.amount)) return -1;
                            if (trans1.amount.isLessThan(trans2.amount)) return 1;
                            return 0;
                        });
                        let n_iterations = 0;


                        for (let trans of other_sortedTransaction){
                            const amount = trans.delegates.find(del => del.delegate === dele_username).amount;
                            const amount_string = `${BigIntToBString(amount.isNegative() ? amount.times(-1) : amount, 8)} ${this.network.client.token}`
                            const sender_string = `<a href="${this.network.client.explorer}/wallets/${trans.sender}">${trans.sender}</a>`
                            if (dele_old_rank < old_rank && dele_new_rank > new_rank){
                                if (trans.type === TransactionsTypes.vote && amount.isLessThan(0)){
                                    new_message += `- ${sender_string} unvoted ${dele_username} with a weight of ${amount_string}\n`
                                    new_message += `<a href="${this.network.client.explorer}/transaction/${trans.id}">View on explorer</a>\n`
                                    n_iterations += 1;
                                }else if (trans.type === TransactionsTypes.transfer && amount.isLessThan(0)){
                                    const recipient_string = trans.recipient? `<a href="${this.network.client.explorer}/wallets/${trans.recipient}">${trans.recipient}</a>` : "";
                                    new_message += `- ${sender_string} that is voting for ${dele_username} sent ${amount_string} to ${recipient_string}\n`
                                    new_message += `<a href="${this.network.client.explorer}/transaction/${trans.id}">View on explorer</a>\n`
                                    n_iterations += 1;
                                }else if (trans.type === TransactionsTypes.burn) {
                                    new_message += `- ${sender_string} that is voting for ${dele_username} burned ${amount_string}\n`
                                    new_message += `<a href="${this.network.client.explorer}/transaction/${trans.id}">View on explorer</a>\n`
                                    n_iterations += 1;
                                }                            
                                
                            }
                            else if (dele_old_rank > old_rank && dele_new_rank < new_rank){
                                if (trans.type === TransactionsTypes.vote && amount.isGreaterThan(0)){
                                    new_message += `- ${sender_string} voted ${dele_username} with a weight of ${amount_string}\n`
                                    new_message += `<a href="${this.network.client.explorer}/transaction/${trans.id}">View on explorer</a>\n`
                                    n_iterations += 1;
                                }else if (trans.type === TransactionsTypes.transfer && amount.isGreaterThan(0)){
                                    const recipient_string = trans.recipient? `<a href="${this.network.client.explorer}/wallets/${trans.recipient}">${trans.recipient}</a>` : "";
                                    new_message += `- ${recipient_string} that is voting for ${dele_username} received ${amount_string} from ${sender_string}\n`
                                    new_message += `<a href="${this.network.client.explorer}/transaction/${trans.id}">View on explorer</a>\n`
                                    n_iterations += 1;
                                }                                
                            }
                            if (n_iterations >= 3) break;
                        }

                        this.logger.info("++++++++++++++++++++++++++++++++++++++++++++++++++++++++++")

                        if (new_message !== "" && (message + new_message).length >= 4000){
                            for (let chat of chat_id_list){
                                if (((chat.Votes !== "OFF" && (delta_votes.isLessThan(new Utils.BigNumber(Number(chat.Votes)).times(-100000000)) || delta_votes.isGreaterThan(new Utils.BigNumber(Number(chat.Votes)).times(100000000)))) || (chat.Position === "ON" &&  Math.abs(delta_rank) > 0) || (change_voters && chat.Voters === "ON")))
                                    this.bot.sendMessage(chat.chat_id, message, Extra.webPreview(false).HTML());
            
                            }
                            message = new_message
                        }else {
                            message += new_message
                        }   
                    }

                                                          

                }

                if (!hasReasons){
                    message += "- Probably block rewards\n"
                }
                if (message !== ""){
                    for (let chat of chat_id_list){
                        if (((chat.Votes !== "OFF" && (delta_votes.isLessThan(new Utils.BigNumber(Number(chat.Votes)).times(-100000000)) || delta_votes.isGreaterThan(new Utils.BigNumber(Number(chat.Votes)).times(100000000)))) || (chat.Position === "ON" &&  Math.abs(delta_rank) > 0) || (change_voters && chat.Voters === "ON")))
                            this.bot.sendMessage(chat.chat_id, message, Extra.webPreview(false).HTML());
    
                    }
                }
                
                


            }
            //result.forEach(data => {this.logger.info(data.username);this.logger.info(data.votediff);this.logger.info(data.rankdiff);this.logger.info(data.transactions);})
        }
    }

    private get_block_transactions = (id : number): Array<Interfaces.ITransactionData> => {
        const temp = this.transactions_queue.filter((o) => o.blockHeight === id);
        this.transactions_queue = this.transactions_queue.filter((o) => o.blockHeight > id);
        return temp;
    }

    private init = async () => {
        this.logger.info("Missed block calculation started")
        const current_height = this.blockchain.getLastHeight();
        const round = AppUtils.roundCalculator.calculateRound(current_height).round;

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

    public getDelegateRankList(): Array<Contracts.State.Wallet>{
        const activeDelegates: Array<Contracts.State.Wallet> = [];

        for (const delegate of this.wallets.allByUsername()) {
            if (!delegate.hasAttribute("delegate.resigned")) {
                activeDelegates.push(delegate.clone());
            }
        }

        activeDelegates.sort((a, b) => {
            const voteBalanceA: Utils.BigNumber = a.getAttribute("delegate.voteBalance");
            const voteBalanceB: Utils.BigNumber = b.getAttribute("delegate.voteBalance");

            const diff = voteBalanceB.comparedTo(voteBalanceA);

            if (diff === 0) {
                AppUtils.assert.defined<string>(a.getPublicKey());
                AppUtils.assert.defined<string>(b.getPublicKey());

                if (a.getPublicKey() === b.getPublicKey()) {
                    const username = a.getAttribute("delegate.username");
                    throw new Error(
                        `The balance and public key of both delegates are identical! ` +
                            `Delegate "${username}" appears twice in the list`,
                    );
                }

                return a.getPublicKey()!.localeCompare(b.getPublicKey()!, "en");
            }

            return diff;
        });

        for (let i = 0; i < activeDelegates.length; i++) {
            activeDelegates[i].setAttribute("delegate.rank", i + 1);
        }

        return activeDelegates;
    }

    public get_missing_delegates = () => {

        return this.missing_delegates;
    }
}
