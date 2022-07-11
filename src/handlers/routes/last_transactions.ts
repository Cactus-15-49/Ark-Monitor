import { Container, Contracts } from "@solar-network/kernel";
import { Interfaces } from "@solar-network/crypto";
import { UContext } from "../../interfaces";



@Container.injectable()
export class last_transactions {

    @Container.inject(Container.Identifiers.TransactionHistoryService)
    private readonly transactionHistoryService!: Contracts.Shared.TransactionHistoryService;

    @Container.inject(Symbol.for("display_transactions"))
    private readonly  transactions_display;

    public display_transactions = async (ctx: UContext) =>  {
        let choice: any;
        if (ctx.user.states[0] === "Dmenu"){
            choice = ctx.user.delegates.find((delegates) => delegates.username === ctx.text || delegates.address === ctx.text);
        }else{
            choice = ctx.user.voters.find((wallet) => wallet.name === ctx.text || wallet.address === ctx.text);
        }
        if (choice !== undefined){
            if (ctx.user.states[0] === "Dmenu"){
                ctx.reply(`Transactions of ${choice.username}`)
            }
            else{
                if (choice.name === undefined){
                    ctx.reply(`Transactions of ${choice.address}`)
                }else{
                    ctx.reply(`Transactions of ${choice.name} (${choice.address})`)
                    
                }
            }
            const transactions: Interfaces.ITransactionData[] = await this.transactionHistoryService.findManyByCriteria({ address: choice.address });
            let message = ""
            const start = Math.max(transactions.length - 5, 0);
            for (const transaction of transactions.slice(start, start + 5).reverse()){
                message += await this.transactions_display.display(transaction, choice.address, ctx.chat_id);
                message += "\n------------------------------------------------------------------\n";
            }
            let keyboard;
            if (transactions.length <= 5) keyboard = { reply_markup: {inline_keyboard: [[{text: "1", callback_data: "a"}]]}}
            else keyboard = { reply_markup: {inline_keyboard: [[{text: "1", callback_data: "a"}, {text: "next", callback_data: `next_1_${choice.address}`}]]}};
            ctx.replyWithHTML(message, keyboard); 
        }
        else{
            ctx.reply("Invalid input. Please use your keyboard or go /Back if you are stuck.")
        }
    }
}