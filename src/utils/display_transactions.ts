import { Container, Contracts } from "@solar-network/kernel";
import { Managers, Interfaces, Utils } from "@solar-network/crypto";
import { Voter } from "../interfaces";
import { BigIntToBString } from "./utils";

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
        if (typeGroup === 1){
            if (type === 0) return this.LegacyTransfer(tx, chat_id);
            if (type === 1) return this.SecondSignature(tx);
            if (type === 2) return this.DelegateRegistration(tx);
            if (type === 3) return this.LegacyVote(tx);
            if (type === 6) return this.Transfer(tx, address);
            if (type === 7) return this.DelegateResignation(tx);
        }else if (typeGroup === 2){
            if (type === 0) return this.Burn(tx);
            if (type === 2) return this.Vote(tx);
        }
        return "";
    } 


    private LegacyTransfer = async (tx, chat_id) => {
        const balance = tx.amount;
        const fee = tx.fee;
        const addresses: Voter[] = await this.db.get_voters(chat_id);
        let sender: string;
        let wallet: Contracts.State.Wallet = this.wallets.findByPublicKey(tx.senderPublicKey);
        if (wallet.hasAttribute("delegate.username"))
            sender = wallet.getAttribute("delegate.username");
        else
            sender = wallet.getAddress();
        if (addresses.find(add => add.address === wallet.getAddress()))
            sender += " (you)";
        
        let recipient: string;
        wallet = this.wallets.findByAddress(tx.recipientId);
        if (wallet.hasAttribute("delegate.username"))
            recipient = wallet.getAttribute("delegate.username");
        else
            recipient = wallet.getAddress();
        if (addresses.find(add => add.address === wallet.getAddress()))
            recipient += " (you)";
        
        let transaction = `${sender} -> ${recipient}\nAmount: ${BigIntToBString(balance, 2)} (${BigIntToBString(fee, 2)})`;

        if (tx.timestamp !== undefined)
            transaction += `\nTimestamp: ${tx.timestamp}`

        if (tx.memo !== undefined)
            transaction += `\nMemo: ${tx.memo}`;

        transaction += `\n<a href="${this.network.client.explorer}/transactions/${tx.id}">View on explorer</a>`
        return transaction;
    }

    private SecondSignature = (tx) => {
        let transaction = `Second signature Transaction`
        if (tx.timestamp !== undefined)
            transaction += `\nTimestamp: ${tx.timestamp}`
        if (tx.memo !== undefined)
            transaction += `\nMemo: ${tx.memo}`;
        transaction += `\n<a href="${this.network.client.explorer}/transactions/${tx.id}">View on explorer</a>`
        return transaction;
    }

    private DelegateRegistration = (tx) => {
        let transaction = `New delegate registered as ${tx.asset.delegate.username}`
        if (tx.timestamp !== undefined)
            transaction += `\nTimestamp: ${tx.timestamp}`
        if (tx.memo !== undefined)
            transaction += `\nMemo: ${tx.memo}`;
        transaction += `\n<a href="${this.network.client.explorer}/transactions/${tx.id}">View on explorer</a>`
        return transaction;
    }

    private LegacyVote = (tx) => {
        const votes = tx.asset.votes;
        let transaction = "";
        for (const vote of votes){
            let delegate: Contracts.State.Wallet;
            if (vote.length > 21) {
                delegate = this.wallets.findByPublicKey(vote.substring(1));
            } else {
                delegate = this.wallets.findByUsername(vote.substring(1));
            }
            if (vote[0] === "+")
                transaction += `You voted for ${delegate.getAttribute("delegate.username")}\n`
            else 
                transaction += `You unvoted for ${delegate.getAttribute("delegate.username")}\n`
        }
        if (tx.timestamp !== undefined)
            transaction += `Timestamp: ${tx.timestamp}\n`
        if (tx.memo !== undefined)
            transaction += `\nMemo: ${tx.memo}`;
        transaction += `<a href="${this.network.client.explorer}/transactions/${tx.id}">View on explorer</a>`
        return transaction;
    }

    private Transfer = (tx, address) => {
        let sender: string;
        const wallet: Contracts.State.Wallet = this.wallets.findByPublicKey(tx.senderPublicKey);
        if (wallet.hasAttribute("delegate.username"))
            sender = wallet.getAttribute("delegate.username");
        else
            sender = wallet.getAddress();
        let balance = Utils.BigNumber.ZERO;
        let recipient = "";
        if (wallet.getAddress() === address){
            sender += " (you)"
            for (let payment of tx.asset.transfers){
                balance = balance.plus(payment.amount);
            }

            recipient = `Transfer (${tx.asset.transfers.length})`
        }
        else{
            for (let payment of tx.asset.transfers){
                if (payment.recipientId === address)
                    balance = balance.plus(payment.amount); 
            }
            const wallet: Contracts.State.Wallet = this.wallets.findByAddress(address);
            if (wallet.hasAttribute("delegate.username"))
                recipient = wallet.getAttribute("delegate.username");
            else
                recipient = wallet.getAddress();
            recipient += " (you)"
        }

        const fee = tx.fee;

        let transaction = `${sender} -> ${recipient}\nAmount: ${BigIntToBString(balance, 2)} (${BigIntToBString(fee, 2)})`;

        if (tx.timestamp !== undefined)
            transaction += `\nTimestamp: ${tx.timestamp}`

        if (tx.memo !== undefined)
            transaction += `\nMemo: ${tx.memo}`;

        transaction += `\n<a href="${this.network.client.explorer}/transactions/${tx.id}">View on explorer</a>`
        return transaction;
    }

    private DelegateResignation = (tx) => {
        const wallet: Contracts.State.Wallet = this.wallets.findByPublicKey(tx.senderPublicKey);
        const type = tx.asset.resignationType;
        let typeString;
        if (!type || type === 0 || type === 1) {
            typeString = `resigned ${type ? "temporarily" : "permanently"}`;
        } else {
            typeString = "revoked resignation";
        }
        let transaction = `Delegate " ${wallet.getAttribute("delegate.username")} ${typeString}.\nTimestamp: ${tx.timestamp}`;
        if (tx.memo !== undefined)
            transaction += `\nMemo: ${tx.memo}`;
        transaction += `\n<a href="${this.network.client.explorer}/transactions/${tx.id}">View on explorer</a>`
        return transaction;
    }

    private Burn = async (tx) => {
        const balance = tx.amount;
        let sender: string;
        let wallet: Contracts.State.Wallet = this.wallets.findByPublicKey(tx.senderPublicKey);
        if (wallet.hasAttribute("delegate.username"))
            sender = wallet.getAttribute("delegate.username");
        else
            sender = wallet.getAddress();
        
        
        let transaction = `${sender} -> Burn\nAmount: ${BigIntToBString(balance, 2)}`;

        if (tx.timestamp !== undefined)
            transaction += `\nTimestamp: ${tx.timestamp}`

        if (tx.memo !== undefined)
            transaction += `\nMemo: ${tx.memo}`;

        transaction += `\n<a href="${this.network.client.explorer}/transactions/${tx.id}">View on explorer</a>`
        return transaction;
    }

    private Vote = (tx) => {
        const votes = tx.asset.votes;
        let transaction = "You voted for: \n";
        for (const vote in votes){
            const delegate = this.wallets.findByUsername(vote);
            transaction += `${delegate.getAttribute("delegate.username")}: ${votes[vote]}%\n`
        }
        if (tx.timestamp !== undefined)
            transaction += `Timestamp: ${tx.timestamp}\n`
        if (tx.memo !== undefined)
            transaction += `\nMemo: ${tx.memo}`;
        transaction += `<a href="${this.network.client.explorer}/transactions/${tx.id}">View on explorer</a>`
        return transaction;
    }

}