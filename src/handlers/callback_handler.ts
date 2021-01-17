import { Container, Contracts } from "@arkecosystem/core-kernel";
import { Managers, Interfaces } from "@arkecosystem/crypto";
import { Extra } from "telegraf";
import { UContext } from "../interfaces";


@Container.injectable()
export class callback_handler{

    @Container.inject(Container.Identifiers.TransactionHistoryService)
    private readonly transactionHistoryService!: Contracts.Shared.TransactionHistoryService;

    @Container.inject(Symbol.for("menu"))
    private readonly menu;

    @Container.inject(Symbol.for("display_transactions"))
    private readonly display_transactions;

    private network = Managers.configManager.get("network");

    public handle = (ctx: UContext) => {
        let data: string | undefined = ctx.callbackQuery!.data;
        if (data === undefined) return;
        let data_array = data.split("_");
        if (data_array.length == 2 && data_array[0] == 'update'){
            if (data == 'update_balance') this.menu.balance(ctx);
            else if (data == 'update_price') this.update_price(ctx);
            else if (data == 'update_delegateinfo') this.menu.delegates_info(ctx);
        }else if (data_array.length == 3){
            let next = data_array[0] === "next";
            if (next == false && data_array[0]!= "previous") return;
            let current_page = Number(data_array[1]);
            if (isNaN(current_page)) return;
            let address = data_array[2];
            this.last_transactions(ctx, next, current_page, address);
        }

    }

    private update_price = (ctx: UContext) => {
        let cmc = false;//let cmc = r.cmc_request()
        if (!cmc){
            ctx.editMessageText(`There are problems with CoinGecko. Try again later.`, Extra.markup((m) => m.inlineKeyboard([
                m.callbackButton("Update", "update_price")
              ])));
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
            
            ctx.editMessageText(`${this.network.client.symbol} STATS:\nPrice: ${price_btc} BTC ($${price})\nMarket cap: ${market_cap_btc} BTC ($${market_cap})\nVolume: ${volume_btc} BTC ($${volume})\n24h change: ${change_24h}%\n7d change: ${change_7d}%\nCirculating supply: ${this.network.client.symbol}${circulating}\nTotal supply: ${this.network.client.symbol}${total_supply}\n`, Extra.markup((m) => m.inlineKeyboard([
                m.callbackButton("Update", "update_price")
              ])))
        }
    }
    
    private last_transactions = async (ctx: UContext, next: boolean, current_page: number, address: string) => {
        let message = "";
        let keyboard;
        const transactions: Interfaces.ITransactionData[] = await this.transactionHistoryService.findManyByCriteria({ address: address });
        if (next){
            let start = transactions.length - (5 *(current_page + 1));
            for (const transaction of transactions.slice(Math.max(start, 0), start + 5 - Math.min(start, 0)).reverse()){
                message += await this.display_transactions.display(transaction, address, ctx.chat_id);
                message += "\n------------------------------------------------------------------\n";
            }
            if (start <= 0 && transactions.length <= 5) keyboard = (m) => m.inlineKeyboard([
                m.callbackButton('1', 'a')
              ])
            else if (start <= 0 ) keyboard = (m) => m.inlineKeyboard([
                m.callbackButton('previous', `previous_${current_page + 1}_${address}`),
                m.callbackButton(`${current_page + 1}`, 'a')
              ])
            else    keyboard = (m) => m.inlineKeyboard([
                m.callbackButton('previous', `previous_${current_page + 1}_${address}`),
                m.callbackButton(`${current_page + 1}`, 'a'),
                m.callbackButton('next', `next_${current_page + 1}_${address}`)
              ])
        }else{
            let start = Math.min(transactions.length - (5 * (current_page - 1)), transactions.length - 5);
            for (const transaction of transactions.slice(Math.max(start, 0), start + 5 - Math.min(start, 0)).reverse()){
                message += await this.display_transactions.display(transaction, address, ctx.chat_id);
                message += "\n------------------------------------------------------------------\n";
            }
            
            if (transactions.length <= 5) keyboard = (m) => m.inlineKeyboard([
                m.callbackButton('1', 'a')
              ])
            else if (start == transactions.length - 5 ) keyboard = (m) => m.inlineKeyboard([
                m.callbackButton('1', 'a'),
                m.callbackButton('next', `next_1_${address}`)
              ])
            else    keyboard = (m) => m.inlineKeyboard([
                m.callbackButton('previous', `previous_${current_page - 1}_${address}`),
                m.callbackButton(`${current_page - 1}`, 'a'),
                m.callbackButton('next', `next_${current_page - 1}_${address}`)
              ])
        }
        ctx.editMessageText(message, Extra.HTML().markup(keyboard));
    }
}