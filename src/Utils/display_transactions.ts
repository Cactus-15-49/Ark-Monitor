import { Container, Contracts, Utils } from "@arkecosystem/core-kernel";
import { Managers, Interfaces } from "@arkecosystem/crypto";
import { Voter } from "../interfaces";
import { BigIntToBString } from "../Utils/utils";

@Container.injectable()
export class display_transactions {

    @Container.inject(Container.Identifiers.WalletRepository)
    @Container.tagged("state", "blockchain")
    private readonly wallets!: Contracts.State.WalletRepository;

    @Container.inject(Container.Identifiers.TransactionHistoryService)
    private readonly transactionHistoryService!: Contracts.Shared.TransactionHistoryService;

    @Container.inject(Symbol.for("database"))
    private readonly db;

    private network = Managers.configManager.get("network");

    public display = async (tx: Interfaces.ITransactionData, address: string, chat_id: number) => {
        const typeGroup = tx.typeGroup;
        const type = tx.type;
        if (typeGroup === 1){
            if (type === 0) return await this.Transfer(tx, chat_id);
            if (type === 1) return this.SecondSignature(tx);
            if (type === 2) return this.DelegateRegistration(tx);
            if (type === 3) return this.Vote(tx);
            if (type === 6) return this.MultiPayment(tx, address);
            if (type === 7) return this.DelegateResignation(tx);
        }else if (typeGroup === 100){
            if (type === 0) return this.Stake(tx, address);
            if (type === 1) return await this.RedeemStake(tx);
            if (type === 2) return await this.CancelStake(tx);
        }
        return "";
    } 


    private Transfer = async (tx, chat_id) => {
        const balance = tx.amount;
        const fee = tx.fee;
        const addresses: Voter[] = await this.db.get_voters(chat_id);
        let sender: string;
        let wallet: Contracts.State.Wallet = this.wallets.findByPublicKey(tx.senderPublicKey);
        if (wallet.hasAttribute("delegate.username"))
            sender = wallet.getAttribute("delegate.username");
        else
            sender = wallet.address;
        if (addresses.some(add => add.address === wallet.address))
            sender += " (you)";
        
        let recipient: string;
        wallet = this.wallets.findByAddress(tx.recipientId);
        if (wallet.hasAttribute("delegate.username"))
            recipient = wallet.getAttribute("delegate.username");
        else
            recipient = wallet.address;
        if (addresses.some(add => add.address === wallet.address))
            recipient += " (you)";
        
        let transaction = `${sender} -> ${recipient}\nAmount: ${BigIntToBString(balance, 2)} (${BigIntToBString(fee, 2)})`;

        if (tx.timestamp !== undefined)
            transaction += `\nTimestamp: ${tx.timestamp}`

        if (tx.vendorField !== undefined)
            transaction += `\nSmartbridge: ${tx.vendorField}`;

        transaction += `\n<a href="${this.network.client.explorer}/transactions/${tx.id}">View on explorer</a>`
        return transaction;
    }

    private SecondSignature = (tx) => {
        let transaction = `Second signature Transaction`
        if (tx.timestamp !== undefined)
            transaction += `\nTimestamp: ${tx.timestamp}`
        transaction += `\n<a href="${this.network.client.explorer}/transactions/${tx.id}">View on explorer</a>`
        return transaction;
    }

    private DelegateRegistration = (tx) => {
        let transaction = `New delegate registered as ${tx.asset.delegate.username}`
        if (tx.timestamp !== undefined)
            transaction += `\nTimestamp: ${tx.timestamp}`
        transaction += `\n<a href="${this.network.client.explorer}/transactions/${tx.id}">View on explorer</a>`
        return transaction;
    }

    private Vote = (tx) => {
        const votes = tx.asset.votes;
        let transaction = "";
        for (const vote of votes){
            const delegate: Contracts.State.Wallet = this.wallets.findByPublicKey(vote.substring(1));
            if (vote[0] === "+")
                transaction += `You voted for ${delegate.getAttribute("delegate.username")}`
            else 
                transaction += `You unvoted for ${delegate.getAttribute("delegate.username")}`
        }
        if (tx.timestamp !== undefined)
            transaction += `\nTimestamp: ${tx.timestamp}`
        transaction += `\n<a href="${this.network.client.explorer}/transactions/${tx.id}">View on explorer</a>`
        return transaction;
    }

    private MultiPayment = (tx, address) => {
        let sender: string;
        const wallet: Contracts.State.Wallet = this.wallets.findByPublicKey(tx.senderPublicKey);
        if (wallet.hasAttribute("delegate.username"))
            sender = wallet.getAttribute("delegate.username");
        else
            sender = wallet.address;
        let balance = Utils.BigNumber.ZERO;
        let recipient = "";
        if (wallet.address === address){
            sender += " (you)"
            for (let payment of tx.asset.payments){
                balance = balance.plus(payment.amount);
            }

            recipient = `Multipayment (${tx.asset.payments.length})`
        }
        else{
            for (let payment of tx.asset.payments){
                if (payment.recipientId === address)
                    balance = balance.plus(payment.amount); 
            }
            const wallet: Contracts.State.Wallet = this.wallets.findByAddress(address);
            if (wallet.hasAttribute("delegate.username"))
                recipient = wallet.getAttribute("delegate.username");
            else
                recipient = wallet.address;
            recipient += " (you)"
        }

        const fee = tx.fee;

        let transaction = `${sender} -> ${recipient}\nAmount: ${BigIntToBString(balance, 2)} (${BigIntToBString(fee, 2)})`;

        if (tx.timestamp !== undefined)
            transaction += `\nTimestamp: ${tx.timestamp}`

        if (tx.vendorField !== undefined)
            transaction += `\nSmartbridge: ${tx.vendorField}`;

        transaction += `\n<a href="${this.network.client.explorer}/transactions/${tx.id}">View on explorer</a>`
        return transaction;
    }

    private DelegateResignation = (tx) => {
        const wallet: Contracts.State.Wallet = this.wallets.findByPublicKey(tx.senderPublicKey);
        let transaction = `Delegate " ${wallet.getAttribute("delegate.username")} resigned.\nTimestamp: ${tx.timestamp}`;
        transaction += `\n<a href="${this.network.client.explorer}/transactions/${tx.id}">View on explorer</a>`
        return transaction;
    }


    //COMPENDIA
    
    private Stake = (tx, address) => {
        const recipient = tx.recipientId;
        const amount = tx.asset.stakeCreate.amount;
        const duration = tx.asset.stakeCreate.duration;
        let string_duration: string;
        if (duration.isEqualTo(31557600))
            string_duration = "1 year"
        else if (duration.isEqualTo(15778800))
            string_duration = "6 months"
        else if (duration.isEqualTo(7889400))
            string_duration = "3 months"
        else if (duration.isEqualTo(86400))
            string_duration = "1 day"
        else
            string_duration = "??"
        let transaction: string;
        if (recipient == address){
            transaction = `You staked ß ${BigIntToBString(amount, 2)} for ${string_duration}\nTimestamp: ${tx.timestamp}`;
        }else{
            transaction = `You sent to ${recipient} ß ${BigIntToBString(amount, 2)} staked for ${string_duration}\nTimestamp: ${tx.timestamp}`;
        }
        transaction += `\n<a href="${this.network.client.explorer}/transactions/${tx.id}">View on explorer</a>`
        return transaction;
    }

    private RedeemStake = async (tx) => {
        const staked_trans: Interfaces.ITransactionData | undefined = await this.transactionHistoryService.findOneByCriteria({ id: tx.asset.stakeRedeem });
        const amount = staked_trans!.asset!.stakeCreate.amount;
        let transaction = `You redeemed a stake of ß ${BigIntToBString(amount, 2)}\nTimestamp: ${tx.timestamp}`
        transaction += `\n<a href="${this.network.client.explorer}/transactions/${tx.id}">View on explorer</a>`
        return transaction;
    }

    private CancelStake = async (tx) => {
        const staked_trans: Interfaces.ITransactionData | undefined = await this.transactionHistoryService.findOneByCriteria({ id: tx.asset.stakeRedeem });
        const amount = staked_trans!.asset!.stakeCreate.amount;
        let transaction = `You canceled a stake of ß ${BigIntToBString(amount, 2)}\nTimestamp: ${tx.timestamp}`
        transaction += `\n<a href="${this.network.client.explorer}/transactions/${tx.id}">View on explorer</a>`
        return transaction;
    }

}