import { Interfaces, Managers, Utils } from "@solar-network/crypto";
import { Container, Contracts } from "@solar-network/kernel";

import { Voter } from "../interfaces";
import { messageComposer } from "./message_composer";

@Container.injectable()
export class display_transactions {
    @Container.inject(Container.Identifiers.WalletRepository)
    @Container.tagged("state", "blockchain")
    private readonly wallets!: Contracts.State.WalletRepository;

    @Container.inject(Symbol.for("database"))
    private readonly db;

    private network = Managers.configManager.get("network");

    public display = (tx: Interfaces.ITransactionData, address: string, chat_id: number) => {
        const typeGroup = tx.typeGroup;
        const type = tx.type;
        if (typeGroup === 1) {
            switch (type) {
                case 0:
                    return this.LegacyTransfer(tx, chat_id);
                case 1:
                    return this.SecondSignature(tx);
                case 2:
                    return this.DelegateRegistration(tx);
                case 3:
                    return this.LegacyVote(tx);
                case 6:
                    return this.Transfer(tx, address);
                case 7:
                    return this.DelegateResignation(tx);
            }
        } else if (typeGroup === 2) {
            switch (type) {
                case 0:
                    return this.Burn(tx);
                case 2:
                    return this.Vote(tx);
            }
        }
        return "";
    };

    private LegacyTransfer = async (tx: Interfaces.ITransactionData, chat_id: number) => {
        const message = new messageComposer();
        const balance = tx.amount;
        const fee = tx.fee;

        const voters: Voter[] = await this.db.get_voters(chat_id);
        const votersAddresses = voters.map((voter) => voter.address);

        const sender_wallet: Contracts.State.Wallet = this.wallets.findByPublicKey(tx.senderPublicKey);

        message
            .addwallet(sender_wallet, votersAddresses)
            .nl()
            .add(`⬇️`)
            .spc()
            .addAmount(balance, 2, true)
            .spc()
            .add("(Fee: ")
            .addAmount(fee, 2)
            .add(")")
            .spc()
            .addnl(`⬇️`);

        const recipient_wallet = this.wallets.findByAddress(tx.recipientId!);

        message.addwallet(recipient_wallet, votersAddresses).nl();

        this.addFooter(message, tx);
        return message.get();
    };

    private SecondSignature = (tx: Interfaces.ITransactionData) => {
        const message = new messageComposer();
        message.addnl(`Second signature Transaction`);

        this.addFooter(message, tx);
        return message.get();
    };

    private DelegateRegistration = (tx: Interfaces.ITransactionData) => {
        const message = new messageComposer();
        message.addnl(`New delegate registered as ${tx.asset!.delegate!.username}`);

        this.addFooter(message, tx);
        return message.get();
    };

    private LegacyVote = (tx: Interfaces.ITransactionData) => {
        const message = new messageComposer();
        const votes = tx.asset!.votes as string[];
        for (const vote of votes) {
            let delegate: Contracts.State.Wallet;
            if (vote.length > 21) {
                delegate = this.wallets.findByPublicKey(vote.substring(1));
            } else {
                delegate = this.wallets.findByUsername(vote.substring(1));
            }
            if (vote[0] === "+") {
                message.addnl(`✅Voted ${delegate.getAttribute("delegate.username")}`);
            } else {
                message.addnl(`❌Unvoted ${delegate.getAttribute("delegate.username")}`);
            }
        }
        this.addFooter(message, tx);
        return message.get();
    };

    private Transfer = (tx: Interfaces.ITransactionData, address: string) => {
        const message = new messageComposer();

        const fee = tx.fee;
        const wallet: Contracts.State.Wallet = this.wallets.findByPublicKey(tx.senderPublicKey);
        message.addwallet(wallet, [address]).nl().add(`⬇️`).spc();
        let balance = Utils.BigNumber.ZERO;
        if (wallet.getAddress() === address) {
            for (const payment of tx.asset!.transfers!) {
                balance = balance.plus(payment.amount);
            }
            message.addAmount(balance, 2, true).spc().add("(Fee: ").addAmount(fee, 2).add(")").spc().addnl(`⬇️`);
            if (tx.asset!.transfers!.length > 1) {
                message.addnl(`Transfer (${tx.asset!.transfers!.length})`);
            } else {
                message.addwallet(this.wallets.findByAddress(tx.asset!.transfers![0].recipientId)).nl();
            }
        } else {
            for (const payment of tx.asset!.transfers!) {
                if (payment.recipientId === address) {
                    balance = balance.plus(payment.amount);
                }
            }
            const wallet: Contracts.State.Wallet = this.wallets.findByAddress(address);
            message
                .addAmount(balance, 2, true)
                .spc()
                .add("(Fee: ")
                .addAmount(fee, 2)
                .add(")")
                .spc()
                .addnl(`⬇️`)
                .addwallet(wallet, [address])
                .nl();
        }

        this.addFooter(message, tx);
        return message.get();
    };

    private DelegateResignation = (tx: Interfaces.ITransactionData) => {
        const message = new messageComposer();
        const wallet: Contracts.State.Wallet = this.wallets.findByPublicKey(tx.senderPublicKey);
        const type = tx.asset!.resignationType;
        let typeString;
        if (!type || type === 0 || type === 1) {
            typeString = `resigned ${type ? "temporarily" : "permanently"}`;
        } else {
            typeString = "revoked resignation";
        }
        message.addnl(`Delegate " ${wallet.getAttribute("delegate.username")} ${typeString}.`);

        this.addFooter(message, tx);
        return message.get();
    };

    private Burn = async (tx: Interfaces.ITransactionData) => {
        const message = new messageComposer();
        const wallet: Contracts.State.Wallet = this.wallets.findByPublicKey(tx.senderPublicKey);

        message.addwallet(wallet).nl().add(`⬇️`).spc().addAmount(tx.amount, 2, true).nl().addnl("Burn");

        this.addFooter(message, tx);
        return message.get();
    };

    private Vote = (tx: Interfaces.ITransactionData) => {
        const message = new messageComposer();
        const votes = tx.asset!.votes as Object;
        if (Object.keys(votes).length > 0) {
            message.addnl("You voted for:");
            for (const vote in votes) {
                const delegate = this.wallets.findByUsername(vote);
                message.addnl(`🗳️${delegate.getAttribute("delegate.username")}: ${votes[vote]}%`);
            }
        } else {
            message.addnl("❌Cancel vote");
        }
        this.addFooter(message, tx);
        return message.get();
    };

    private addFooter(message: messageComposer, tx: Interfaces.ITransactionData) {
        message.nl();
        if (tx.timestamp !== undefined) {
            message.addnl(`🕛: ${tx.timestamp}`);
        }

        if (tx.memo !== undefined) {
            message.addnl(`🗒️: ${this.memoEncode(tx.memo)}`);
        }

        message.add(`<a href="${this.network.client.explorer}/transactions/${tx.id}">View on explorer</a>`);
    }

    private memoEncode(memo: string) {
        return memo.replace(/[\u00A0-\u9999<>\&]/g, function (i) {
            return "&#" + i.charCodeAt(0) + ";";
        });
    }
}
