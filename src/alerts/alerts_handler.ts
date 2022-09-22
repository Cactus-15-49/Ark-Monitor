import { Enums as CryptoEnums, Interfaces, Managers, Utils } from "@solar-network/crypto";
import { Repositories } from "@solar-network/database";
import { Container, Contracts, Enums, Providers, Utils as AppUtils } from "@solar-network/kernel";
import { Extra, Telegram } from "telegraf";

import { Delegate, simplified_transaction, TransactionsTypes, Voter } from "../interfaces";
import { messageComposer } from "../utils/message_composer";
import { BigIntToBString } from "../utils/utils";

@Container.injectable()
export class alerts_handler {
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

    @Container.inject(Container.Identifiers.TransactionHistoryService)
    private readonly transactionHistoryService!: Contracts.Shared.TransactionHistoryService;

    @Container.inject(Symbol.for("display_transactions"))
    private readonly display_transactions;

    @Container.inject(Symbol.for("database"))
    private readonly db;

    @Container.inject(Container.Identifiers.PluginConfiguration)
    @Container.tagged("plugin", "@cactus1549/ark-monitor")
    private readonly configuration!: Providers.PluginConfiguration;

    private bot;
    private network = Managers.configManager.get("network");

    private LAST_BLOCK_DELEGATES: Array<Contracts.State.WalletDelegateAttributes & { publicKey: string }> = [];
    private transactions_queue: Array<Interfaces.ITransactionData> = [];

    // eslint-disable-next-line @typescript-eslint/member-ordering
    public missing_delegates = new Map<string, number>();

    public async start() {
        const token: string | undefined = this.configuration.get("telegram_token");
        if (!token) {
            this.logger.error("Token not set. The bot will not send out notifications.");
            return;
        }
        await this.init();
        this.bot = new Telegram(token);

        this.LAST_BLOCK_DELEGATES = this.getDelegateRankList().map((delegate) => {
            const pkey = delegate.getPublicKey();
            const del = { ...delegate.getAttribute("delegate") };
            del.publicKey = pkey;
            return del;
        });
        this.events.listen(Enums.BlockEvent.Applied, {
            handle: async ({ data }: { data: Interfaces.IBlockData }) => {
                const new_block_delegates: Array<Contracts.State.WalletDelegateAttributes & { publicKey: string }> =
                    this.getDelegateRankList().map((delegate) => {
                        const pkey = delegate.getPublicKey();
                        const del = { ...delegate.getAttribute("delegate") };
                        del.publicKey = pkey;
                        return del;
                    });
                const old_delegates = this.LAST_BLOCK_DELEGATES.map((obj) => ({ ...obj }));
                this.LAST_BLOCK_DELEGATES = new_block_delegates.map((obj) => ({ ...obj }));
                this.process_new_block(
                    new_block_delegates.map((obj) => ({ ...obj })),
                    old_delegates,
                    data,
                );

                const producer: string = data.generatorPublicKey;
                const delegate: Contracts.State.Wallet = this.wallets.findByPublicKey(producer);
                const username: string = delegate.getAttribute("delegate.username");
                if (this.missing_delegates.has(producer)) {
                    const consecutive = this.missing_delegates.get(producer);
                    this.missing_delegates.delete(producer);
                    const delegate_chat: Delegate[] = await this.db.get_all_delegates_Missing(username);

                    const voter_list: Voter[] = await this.db.get_all_voters_Rednodes();
                    for (const chat of delegate_chat) {
                        this.sendAlert(chat.chat_id, `🟢${username} is Green again.🟢\nMissed blocks: ${consecutive}`);
                    }
                    for (const voter of voter_list) {
                        const wallet: Contracts.State.Wallet = this.wallets.findByAddress(voter.address);
                        if (wallet.hasVoted() && !wallet.getVoteBalance(username).isZero()) {
                            this.sendAlert(
                                voter.chat_id,
                                `🟢${username} (voted by ${voter.address}) is green again.🟢\nMissed blocks: ${consecutive}`,
                            );
                        }
                    }
                }
            },
        });

        this.events.listen(Enums.TransactionEvent.Applied, {
            handle: async ({ data }: { data: Interfaces.ITransactionData }) => {
                this.transactions_queue.push(data);

                const transaction: Interfaces.ITransactionData = data;
                const sender_p_key = transaction.senderPublicKey;
                const wallet: Contracts.State.Wallet = this.wallets.findByPublicKey(sender_p_key);
                const addresses: string[] = [wallet.getAddress()];
                if (transaction.typeGroup === 1 && transaction.type === 6) {
                    transaction.asset!.transfers!.forEach((element) => {
                        const address = element.recipientId;
                        if (!addresses.includes(address)) addresses.push(address);
                    });
                } else {
                    if (transaction.recipientId && !addresses.includes(transaction.recipientId))
                        addresses.push(transaction.recipientId);
                }
                for (const address of addresses) {
                    const alerts = await this.db.get_voter_by_address_and_transaction(address);
                    for (const alert of alerts) {
                        this.sendAlert(
                            alert.chat_id as number,
                            `🆕 TRANSACTION⚠️\n${await this.display_transactions.display(
                                transaction,
                                alert.address,
                                alert.chat_id,
                            )}`,
                            true,
                        );
                    }
                }
            },
        });

        this.events.listen(Enums.RoundEvent.Missed, {
            handle: async (data) => {
                const delegate: Contracts.State.Wallet = data.data.delegate;
                const username: string = delegate.getAttribute("delegate.username");
                const pkey = delegate.getPublicKey();
                if (pkey !== undefined) {
                    let consecutive = 1;
                    if (this.missing_delegates.has(pkey)) {
                        consecutive = this.missing_delegates.get(pkey)! + 1;
                        this.missing_delegates.set(pkey, consecutive);
                    } else this.missing_delegates.set(delegate.getPublicKey()!, 1);

                    const delegate_chat: Delegate[] = await this.db.get_all_delegates_Missing(username);

                    const voter_list: Voter[] = await this.db.get_all_voters_Rednodes();

                    if (consecutive === 1) {
                        for (const chat of delegate_chat) {
                            this.sendAlert(chat.chat_id, `🟠${username} is Orange🟠`);
                        }
                        for (const voter of voter_list) {
                            const wallet: Contracts.State.Wallet = this.wallets.findByAddress(voter.address);
                            if (wallet.hasVoted() && !wallet.getVoteBalance(username).isZero()) {
                                this.sendAlert(voter.chat_id, `🟠${username} (voted by ${voter.address}) is Orange🟠`);
                            }
                        }
                    } else if (consecutive === 2) {
                        for (const chat of delegate_chat) {
                            this.sendAlert(chat.chat_id, `🔴${username} is Red🔴\nℹ️Missed blocks: ${consecutive}`);
                        }
                        for (const voter of voter_list) {
                            const wallet: Contracts.State.Wallet = this.wallets.findByAddress(voter.address);
                            if (wallet.hasVoted() && !wallet.getVoteBalance(username).isZero()) {
                                this.sendAlert(
                                    voter.chat_id,
                                    `🔴${username} (voted by ${voter.address}) is Red🔴\nℹ️Missed blocks: ${consecutive}`,
                                );
                            }
                        }
                    } else if (consecutive % 18 === 0) {
                        for (const chat of delegate_chat) {
                            this.sendAlert(chat.chat_id, `🔴${username} is Red🔴\nℹ️Missed blocks: ${consecutive}`);
                        }
                    } else if (consecutive % 212 === 0) {
                        for (const voter of voter_list) {
                            const wallet: Contracts.State.Wallet = this.wallets.findByAddress(voter.address);
                            if (wallet.hasVoted() && !wallet.getVoteBalance(username).isZero()) {
                                this.sendAlert(
                                    voter.chat_id,
                                    `🔴${username} (voted by ${voter.address}) is Red🔴\nℹ️Missed blocks: ${consecutive}`,
                                );
                            }
                        }
                    }
                }
            },
        });
    }

    public get_missing_delegates = () => {
        return this.missing_delegates;
    };

    private async process_new_block(
        new_delegates: Array<Contracts.State.WalletDelegateAttributes & { publicKey: string }>,
        old_delegates: Array<Contracts.State.WalletDelegateAttributes & { publicKey: string }>,
        block: Interfaces.IBlockData,
    ) {
        const delegates_difference: Array<
            Contracts.State.WalletDelegateAttributes & {
                publicKey: string;
                votediff: Utils.BigNumber;
                rankdiff: number;
                transactions: simplified_transaction[];
            }
        > = new_delegates
            .map((element) => {
                const difference: Contracts.State.WalletDelegateAttributes & {
                    publicKey: string;
                    votediff: Utils.BigNumber;
                    rankdiff: number;
                    transactions: simplified_transaction[];
                } = { ...element, votediff: Utils.BigNumber.ZERO, rankdiff: 0, transactions: [] };
                const last_block_delegate = old_delegates.find((o) => {
                    return o.username === difference.username;
                });
                if (last_block_delegate !== undefined) {
                    difference.votediff = difference.voteBalance.minus(last_block_delegate.voteBalance);
                    difference.rankdiff = difference.rank! - last_block_delegate.rank!;
                }

                return difference;
            })
            .filter((element) => {
                return !element.votediff.isZero() || element.rankdiff !== 0;
            });

        if (delegates_difference.length > 0) {
            const transactions = this.get_block_transactions(block.height);
            const normalized_transactions = transactions.flatMap((trans) => {
                const sender = this.wallets.findByPublicKey(trans.senderPublicKey);

                const transaction: simplified_transaction = {
                    type: TransactionsTypes.vote,
                    id: trans.id!,
                    sender: sender.getAddress(),
                    recipient: undefined,
                    amount: trans.amount,
                    delegates: [],
                };

                const senderVote = sender.getVoteDistribution();
                if (trans.typeGroup === 1 && trans.type === 3) {
                    transaction.amount = sender.getBalance();
                    const votes = trans.asset!.votes as string[];
                    for (const vote of votes) {
                        const delegate =
                            vote.substring(1).length > 21
                                ? this.wallets.findByPublicKey(vote.substring(1))
                                : this.wallets.findByUsername(vote.substring(1));
                        transaction.delegates.push({
                            delegate: delegate.getAttribute("delegate.username"),
                            amount: vote[0] === "+" ? transaction.amount : transaction.amount.times(-1),
                        });
                    }
                    if (transaction.delegates[0].delegate === transaction.delegates[1].delegate) {
                        transaction.delegates = [];
                    }
                    return transaction;
                } else if (trans.typeGroup === 1 && trans.type === 6) {
                    const multi_transactions: simplified_transaction[] = [];
                    transaction.type = TransactionsTypes.transfer;

                    for (const transfer of trans.asset!.transfers!) {
                        transaction.delegates = [];
                        transaction.amount = transfer.amount;
                        transaction.recipient = transfer.recipientId;
                        for (const delegate of Object.keys(senderVote)) {
                            transaction.delegates.push({
                                delegate,
                                amount: transaction.amount
                                    .times(Math.round(-senderVote[delegate].percent * 100))
                                    .dividedBy(10000),
                            });
                        }
                        const recipient = this.wallets.findByAddress(transaction.recipient);
                        const recipientVote = recipient.getVoteDistribution();
                        for (const delegate of Object.keys(recipientVote)) {
                            if (transaction.delegates.find((del) => del.delegate === delegate)) {
                                transaction.delegates = transaction.delegates.map((del) => {
                                    if (del.delegate === delegate)
                                        return {
                                            delegate: del.delegate,
                                            amount: del.amount.plus(
                                                transaction.amount
                                                    .times(Math.round(recipientVote[delegate].percent * 100))
                                                    .dividedBy(10000),
                                            ),
                                        };
                                    return del;
                                });
                            } else {
                                transaction.delegates.push({
                                    delegate,
                                    amount: transaction.amount
                                        .times(Math.round(recipientVote[delegate].percent * 100))
                                        .dividedBy(10000),
                                });
                            }
                        }
                        transaction.delegates = transaction.delegates.filter((del) => !del.amount.isZero());
                        if (transaction.delegates.length) {
                            multi_transactions.push({ ...transaction, delegates: [...transaction.delegates] });
                        }
                    }
                    return multi_transactions;
                } else if (trans.typeGroup === 1 && trans.type === 0) {
                    transaction.type = TransactionsTypes.transfer;

                    transaction.delegates = [];
                    transaction.recipient = trans.recipientId;
                    for (const delegate of Object.keys(senderVote)) {
                        transaction.delegates.push({
                            delegate,
                            amount: transaction.amount
                                .times(Math.round(-senderVote[delegate].percent * 100))
                                .dividedBy(10000),
                        });
                    }
                    const recipient = this.wallets.findByAddress(transaction.recipient!);
                    const recipientVote = recipient.getVoteDistribution();
                    for (const delegate of Object.keys(recipientVote)) {
                        if (transaction.delegates.find((del) => del.delegate === delegate)) {
                            transaction.delegates = transaction.delegates.map((del) => {
                                if (del.delegate === delegate)
                                    return {
                                        delegate: del.delegate,
                                        amount: del.amount.plus(
                                            transaction.amount
                                                .times(Math.round(recipientVote[delegate].percent * 100))
                                                .dividedBy(10000),
                                        ),
                                    };
                                return del;
                            });
                        } else {
                            transaction.delegates.push({
                                delegate,
                                amount: transaction.amount
                                    .times(Math.round(recipientVote[delegate].percent * 100))
                                    .dividedBy(10000),
                            });
                        }
                    }
                    transaction.delegates = transaction.delegates.filter((del) => !del.amount.isZero());
                    if (transaction.delegates.length) {
                        return transaction;
                    }

                    return [];
                } else if (trans.typeGroup === 2 && trans.type === 0) {
                    transaction.type = TransactionsTypes.burn;

                    transaction.delegates = [];
                    for (const delegate of Object.keys(senderVote)) {
                        transaction.delegates.push({
                            delegate,
                            amount: transaction.amount
                                .times(Math.round(-senderVote[delegate].percent * 100))
                                .dividedBy(10000),
                        });
                    }
                    if (transaction.delegates.length) {
                        return transaction;
                    }

                    return [];
                } else if (trans.typeGroup === 2 && trans.type === 2) {
                    transaction.amount = sender.getBalance();
                    const newVotes = trans.asset!.votes!;
                    const oldVotes: object = this.getPreviousVotes(trans);
                    const allDelegates = Object.keys(oldVotes).concat(
                        Object.keys(newVotes).filter((item) => Object.keys(oldVotes).indexOf(item) < 0),
                    );
                    for (const delegate of allDelegates) {
                        const diff = transaction.amount
                            .times(Math.round((newVotes[delegate] || 0) * 100))
                            .minus(transaction.amount.times(Math.round((oldVotes[delegate] || 0) * 100)))
                            .dividedBy(10000);
                        transaction.delegates.push({ delegate, amount: diff });
                    }
                    transaction.delegates = transaction.delegates.filter((del) => !del.amount.isZero());
                    if (transaction.delegates.length) {
                        return transaction;
                    }
                    return [];
                }

                return [];
            });

            const result = delegates_difference.map((wallet) => {
                wallet.transactions = normalized_transactions.filter((o) =>
                    o.delegates.find((delegate) => wallet.username === delegate.delegate),
                );
                return wallet;
            });

            const current_height = this.blockchain.getLastHeight();
            const milestone = Managers.configManager.getMilestone(current_height);

            for (const delegate of result) {
                const chat_id_list: Delegate[] = await this.db.get_delegates_from_username(delegate.username);
                const message = new messageComposer("🔔 <b>DELEGATE CHANGE</b> 🔔");
                message.nl().nl().addnl(`⛏ Delegate: ${delegate.username}`);
                const delta_rank: number = delegate.rankdiff;
                const new_rank: number = delegate.rank!;
                const old_rank = new_rank - delta_rank;
                const delta_votes: Utils.BigNumber = delegate.votediff;
                const new_votes: Utils.BigNumber = delegate.voteBalance;
                const old_votes = new_votes.minus(delta_votes);
                const change_voters = delegate.transactions.some((o) => o.type === TransactionsTypes.vote);

                message.add(`🥇 Rank: ${old_rank}`).spc();
                if (delta_rank < 0) message.addnl(`--(+${Math.abs(delta_rank)})--> ${new_rank} 🔺`);
                else if (delta_rank > 0) message.addnl(`--(-${Math.abs(delta_rank)})--> ${new_rank} 🔻`);
                else message.addnl("🟰");

                message.add(`🗳 Votes: ${BigIntToBString(old_votes, 0)}`).spc();
                if (delta_votes.isNegative())
                    message.addnl(
                        `--(-${BigIntToBString(delta_votes.times(-1), 0)})--> ${BigIntToBString(new_votes, 0)} 🔻`,
                    );
                else if (delta_votes.isGreaterThan(0))
                    message.addnl(`--(+${BigIntToBString(delta_votes, 0)})--> ${BigIntToBString(new_votes, 0)} 🔺`);
                else message.addnl("🟰");

                if (old_rank <= milestone.activeDelegates && milestone.activeDelegates < new_rank) {
                    message.nl().addnl("⚠️YOU ARE NOW A STANDBY DELEGATE⚠️").nl();

                    const voter_list: Voter[] = await this.db.get_all_voters_outForging();
                    for (const voter of voter_list) {
                        const wallet: Contracts.State.Wallet = this.wallets.findByAddress(voter.address);
                        if (wallet.hasVoted() && !wallet.getVoteBalance(delegate.username).isZero()) {
                            this.sendAlert(
                                voter.chat_id,
                                `⚠️Delegate ${delegate.username} (voted by ${voter.address}) is out from the forging delegates!⚠️\nℹ️New Rank: ${new_rank}.`,
                            );
                        }
                    }

                    if (this.missing_delegates.has(delegate.publicKey)) {
                        const consecutive = this.missing_delegates.get(delegate.publicKey);
                        const delegate_chat: Delegate[] = await this.db.get_all_delegates_Missing(delegate.username);

                        const voter_list: Voter[] = await this.db.get_all_voters_Rednodes();
                        for (const chat of delegate_chat) {
                            this.sendAlert(
                                chat.chat_id,
                                `⚠️${delegate.username} is out because he was red.⚠️\nℹ️Missed blocks: ${consecutive}`,
                            );
                        }
                        for (const voter of voter_list) {
                            const wallet: Contracts.State.Wallet = this.wallets.findByAddress(voter.address);
                            if (wallet.hasVoted() && !wallet.getVoteBalance(delegate.username).isZero()) {
                                this.sendAlert(
                                    voter.chat_id,
                                    `⚠️${delegate.username} (voted by ${voter.address}) is out because he was red.⚠️\nℹ️Missed blocks: ${consecutive}`,
                                );
                            }
                        }
                    }
                } else if (old_rank > milestone.activeDelegates && milestone.activeDelegates >= new_rank) {
                    message.nl().addnl("🤑YOU ARE NOW ON A FORGING POSITION!🤑").nl();

                    const voter_list: Voter[] = await this.db.get_all_voters_outForging();
                    for (const voter of voter_list) {
                        const wallet: Contracts.State.Wallet = this.wallets.findByAddress(voter.address);
                        if (wallet.hasVoted() && !wallet.getVoteBalance(delegate.username).isZero()) {
                            this.sendAlert(
                                voter.chat_id,
                                `🤑Delegate ${delegate.username} (voted by ${voter.address}) is now in a forging position!🤑\nℹ️New Rank: ${new_rank}.`,
                            );
                        }
                    }
                }

                if (chat_id_list.length <= 0) continue;
                message.addnl("<b>Reasons:</b>");
                let hasReasons = false;
                if (delegate.transactions.length) {
                    hasReasons = true;
                    const sortedTransaction = delegate.transactions.sort((trans1, trans2) => {
                        if (trans1.amount.isGreaterThan(trans2.amount)) return -1;
                        if (trans1.amount.isLessThan(trans2.amount)) return 1;
                        return 0;
                    });
                    for (const trans of sortedTransaction.slice(0, 5)) {
                        const amount = trans.delegates.find((del) => del.delegate === delegate.username)!.amount;
                        if (trans.type === TransactionsTypes.vote && amount.isGreaterThan(0)) {
                            message.addshrtwallet(trans.sender, this.network.client.explorer as string);
                            message.add("✅🗳");
                        } else if (trans.type === TransactionsTypes.vote && amount.isLessThan(0)) {
                            message.addshrtwallet(trans.sender, this.network.client.explorer as string);
                            message.add("❌🗳");
                        } else if (trans.type === TransactionsTypes.transfer && amount.isLessThan(0)) {
                            message.addshrtwallet(trans.sender, this.network.client.explorer as string);
                            message.add("➡️");
                        } else if (trans.type === TransactionsTypes.transfer && amount.isGreaterThan(0)) {
                            message.addshrtwallet(trans.recipient!, this.network.client.explorer as string);
                            message.add("⬅️");
                        } else if (trans.type === TransactionsTypes.burn) {
                            message.add("🔥");
                        }
                        message.addAmount(amount.isNegative() ? amount.times(-1) : amount, 8, true).nl();
                        message.addnl(
                            `<a href="${this.network.client.explorer}/transaction/${trans.id}">View on explorer</a>`,
                        );
                    }
                }

                if (delta_rank !== 0) {
                    for (const other_delegate of result) {
                        const new_message = new messageComposer();
                        const dele_username = other_delegate.username;
                        if (dele_username === delegate.username || other_delegate.transactions.length === 0) continue;
                        const dele_new_rank = other_delegate.rank;
                        const dele_old_rank = dele_new_rank! - other_delegate.rankdiff;

                        if (
                            dele_old_rank > old_rank &&
                            dele_new_rank! < new_rank &&
                            other_delegate.transactions.some((trans) =>
                                trans.delegates.some(
                                    (del) => del.delegate === dele_username && del.amount.isGreaterThan(0),
                                ),
                            )
                        ) {
                            new_message.add("↗️");
                        } else if (
                            dele_old_rank < old_rank &&
                            dele_new_rank! > new_rank &&
                            other_delegate.transactions.some((trans) =>
                                trans.delegates.some(
                                    (del) => del.delegate === dele_username && del.amount.isLessThan(0),
                                ),
                            )
                        ) {
                            new_message.add("↘️");
                        } else continue;

                        new_message.spc().addnl(dele_username);
                        const other_sortedTransaction = other_delegate.transactions.sort((trans1, trans2) => {
                            if (trans1.amount.isGreaterThan(trans2.amount)) return -1;
                            if (trans1.amount.isLessThan(trans2.amount)) return 1;
                            return 0;
                        });
                        let n_iterations = 0;

                        for (const trans of other_sortedTransaction) {
                            hasReasons = true;
                            const amount = trans.delegates.find((del) => del.delegate === dele_username)!.amount;
                            if (dele_old_rank < old_rank && dele_new_rank! > new_rank) {
                                if (trans.type === TransactionsTypes.vote && amount.isLessThan(0)) {
                                    new_message
                                        .add("↳")
                                        .addshrtwallet(trans.sender, this.network.client.explorer as string);
                                    new_message.add("❌🗳");
                                    new_message
                                        .addAmount(amount.isNegative() ? amount.times(-1) : amount, 8, true)
                                        .nl();
                                    new_message.addnl(
                                        `↳<a href="${this.network.client.explorer}/transaction/${trans.id}">View on explorer</a>`,
                                    );
                                    n_iterations += 1;
                                } else if (trans.type === TransactionsTypes.transfer && amount.isLessThan(0)) {
                                    new_message
                                        .add("↳")
                                        .addshrtwallet(trans.sender, this.network.client.explorer as string);
                                    new_message.add("➡️");
                                    new_message
                                        .addAmount(amount.isNegative() ? amount.times(-1) : amount, 8, true)
                                        .nl();
                                    new_message.addnl(
                                        `↳<a href="${this.network.client.explorer}/transaction/${trans.id}">View on explorer</a>`,
                                    );
                                    n_iterations += 1;
                                } else if (trans.type === TransactionsTypes.burn) {
                                    new_message
                                        .add("↳")
                                        .addshrtwallet(trans.sender, this.network.client.explorer as string);
                                    new_message.add("🔥");
                                    new_message
                                        .addAmount(amount.isNegative() ? amount.times(-1) : amount, 8, true)
                                        .nl();
                                    new_message.addnl(
                                        `↳<a href="${this.network.client.explorer}/transaction/${trans.id}">View on explorer</a>`,
                                    );
                                    n_iterations += 1;
                                }
                            } else if (dele_old_rank > old_rank && dele_new_rank! < new_rank) {
                                if (trans.type === TransactionsTypes.vote && amount.isGreaterThan(0)) {
                                    new_message
                                        .add("↳")
                                        .addshrtwallet(trans.sender, this.network.client.explorer as string);
                                    new_message.add("✅🗳");
                                    new_message
                                        .addAmount(amount.isNegative() ? amount.times(-1) : amount, 8, true)
                                        .nl();
                                    new_message.addnl(
                                        `↳<a href="${this.network.client.explorer}/transaction/${trans.id}">View on explorer</a>`,
                                    );
                                    n_iterations += 1;
                                } else if (trans.type === TransactionsTypes.transfer && amount.isGreaterThan(0)) {
                                    new_message
                                        .add("↳")
                                        .addshrtwallet(trans.recipient!, this.network.client.explorer as string);
                                    new_message.add("⬅️");
                                    new_message
                                        .addAmount(amount.isNegative() ? amount.times(-1) : amount, 8, true)
                                        .nl();
                                    new_message.addnl(
                                        `↳<a href="${this.network.client.explorer}/transaction/${trans.id}">View on explorer</a>`,
                                    );
                                    n_iterations += 1;
                                }
                            }
                            if (n_iterations >= 3) break;
                        }

                        if (new_message.len() && message.len() + new_message.len() >= 4000) {
                            for (const chat of chat_id_list) {
                                if (
                                    (chat.Votes !== "OFF" &&
                                        (delta_votes.isLessThan(
                                            new Utils.BigNumber(Number(chat.Votes)).times(-100000000),
                                        ) ||
                                            delta_votes.isGreaterThan(
                                                new Utils.BigNumber(Number(chat.Votes)).times(100000000),
                                            ))) ||
                                    (chat.Position === "ON" && Math.abs(delta_rank) > 0) ||
                                    (change_voters && chat.Voters === "ON")
                                )
                                    this.sendAlert(chat.chat_id, message.get(), true);
                            }
                            message.set(new_message.get());
                        } else {
                            message.addnl(new_message.get());
                        }
                    }
                }

                if (!hasReasons) {
                    message.addnl("- Probably block rewards");
                }
                if (message.len()) {
                    for (const chat of chat_id_list) {
                        if (
                            (chat.Votes !== "OFF" &&
                                (delta_votes.isLessThan(new Utils.BigNumber(Number(chat.Votes)).times(-100000000)) ||
                                    delta_votes.isGreaterThan(
                                        new Utils.BigNumber(Number(chat.Votes)).times(100000000),
                                    ))) ||
                            (chat.Position === "ON" && Math.abs(delta_rank) > 0) ||
                            (change_voters && chat.Voters === "ON")
                        )
                            this.sendAlert(chat.chat_id, message.get(), true);
                    }
                }
            }
        }
    }

    private async getPreviousVotes(transaction: Interfaces.ITransactionData): Promise<object> {
        const heightAndSender = {
            blockHeight: { to: transaction.blockHeight! - 1 },
            senderId: transaction.senderId,
        };

        const criteria = {
            ...heightAndSender,
            typeGroup: CryptoEnums.TransactionTypeGroup.Solar,
            type: CryptoEnums.TransactionType.Solar.Vote,
        };

        const legacyCriteria = {
            ...heightAndSender,
            typeGroup: CryptoEnums.TransactionTypeGroup.Core,
            type: CryptoEnums.TransactionType.Core.Vote,
        };

        const { results } = await this.transactionHistoryService.listByCriteria(
            [criteria, legacyCriteria],
            [{ property: "blockHeight", direction: "desc" }],
            { offset: 0, limit: 1 },
        );

        if (results[0] && results[0].asset) {
            if (!Array.isArray(results[0].asset.votes)) {
                return results[0].asset.votes!;
            }

            const previousVote = results[0].asset.votes.pop();
            if (previousVote && previousVote.startsWith("+")) {
                let delegateVote: string = previousVote.slice(1);
                if (delegateVote.length === 66) {
                    delegateVote = this.wallets.findByPublicKey(delegateVote).getAttribute("delegate.username");
                }
                return { [delegateVote]: 100 };
            }
        }

        return {};
    }

    private get_block_transactions = (id: number): Array<Interfaces.ITransactionData> => {
        const temp = this.transactions_queue.filter((o) => o.blockHeight === id);
        this.transactions_queue = this.transactions_queue.filter((o) => o.blockHeight! > id);
        return temp;
    };

    private init = async () => {
        this.logger.info("Missed block calculation started");
        const current_height = this.blockchain.getLastHeight();
        const round = AppUtils.roundCalculator.calculateRound(current_height).round;

        const milestone = Managers.configManager.getMilestone(current_height);
        const number_delegates = milestone.activeDelegates;

        let current_round = round - 1;

        let missing = true;
        while (missing) {
            missing = false;

            const delegates = await this.roundRepository.findById(current_round.toString());
            const blocks = await this.blockRepository.findByHeightRange(
                (current_round - 1) * number_delegates + 1,
                current_round * number_delegates,
            );

            delegates.forEach((delegate) => {
                if (!(current_round === round - 1 || this.missing_delegates.has(delegate.publicKey))) return;
                const missed = !blocks.some((block) => {
                    return delegate.publicKey === block.generatorPublicKey;
                });
                if (missed) {
                    missing = true;
                    if (this.missing_delegates.has(delegate.publicKey))
                        this.missing_delegates.set(
                            delegate.publicKey,
                            this.missing_delegates.get(delegate.publicKey)! + 1,
                        );
                    else this.missing_delegates.set(delegate.publicKey, 1);
                }
            });
            current_round -= 1;
        }
        this.logger.debug("CALCULATION MISSED BLOCKS FINISHED");
    };

    private getDelegateRankList(): Array<Contracts.State.Wallet> {
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

    private async sendAlert(chatId: number, message: string, isHTML = false) {
        try {
            await this.bot.sendMessage(chatId, message, isHTML ? Extra.webPreview(false).HTML() : undefined);
        } catch (err) {
            if (
                err.response &&
                err.response.error_code === 403 &&
                err.response.description.includes("blocked by the user")
            ) {
                const chatId = err.on.payload.chat_id;
                this.logger.warning(`Removing ${chatId} because he blocked our telegram bot!`);
                this.db.delete_user(chatId);
            }
        }
    }
}
