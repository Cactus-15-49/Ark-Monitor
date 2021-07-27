import { Container, Contracts, Providers } from "@arkecosystem/core-kernel";
import { Managers, Interfaces } from "@arkecosystem/crypto";
import { Extra } from "telegraf";
import { coingecko_request } from "../utils/coingecko";
import { UContext } from "../interfaces";


@Container.injectable()
export class callback_handler{

    @Container.inject(Container.Identifiers.TransactionHistoryService)
    private readonly transactionHistoryService!: Contracts.Shared.TransactionHistoryService;

    @Container.inject(Container.Identifiers.PluginConfiguration)
    @Container.tagged("plugin", "@cactus1549/ark-monitor")
    private readonly configuration!: Providers.PluginConfiguration;

    @Container.inject(Symbol.for("menu"))
    private readonly menu;

    @Container.inject(Symbol.for("display_transactions"))
    private readonly display_transactions;

    private network = Managers.configManager.get("network");

    public handle = (ctx: UContext) => {
        const data: string | undefined = ctx.callbackQuery!.data;
        if (data === undefined) return;
        const data_array = data.split("_");
        if (data_array.length == 2 && data_array[0] == 'update'){
            if (data == 'update_balance') this.menu.balance(ctx);
            else if (data == 'update_price') this.update_price(ctx);
            else if (data == 'update_delegateinfo') this.menu.delegates_info(ctx);
        }else if (data_array.length == 3){
            const next = data_array[0] === "next";
            if (next === false && data_array[0] !== "previous") return;
            const current_page = Number(data_array[1]);
            if (isNaN(current_page)) return;
            const address = data_array[2];
            this.last_transactions(ctx, next, current_page, address);
        }

    }

    private update_price = async (ctx: UContext) => {
        const coingecko = await coingecko_request(this.get_coingecko_ticker());
        if (coingecko === undefined){
            const message = `There are problems with CoinGecko. Try again later.`
            const keyboard = Extra.markup((m) => m.inlineKeyboard([m.callbackButton("Update", "update_price")]))
            try{
                ctx.editMessageText(message, keyboard);
            }catch(e){
                ctx.editMessageText(message + ".", keyboard);
            }
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
            
            const message = `${this.network.client.symbol} STATS:\nPrice: ${price_btc} BTC ($${price})\nMarket cap rank: ${rank}\n\nMarket cap: ${market_cap_btc} BTC ($${market_cap})\nVolume: ${volume_btc} BTC ($${volume})\n\n24h change: ${change_24h}%\n7d change: ${change_7d}%\n\nCirculating supply: ${this.network.client.symbol}${circulating}\nTotal supply: ${this.network.client.symbol}${total_supply}`
            const keyboard = Extra.markup((m) => m.inlineKeyboard([
                m.callbackButton("Update", "update_price")
              ]))
            try{
                ctx.editMessageText(message, keyboard);
            }catch(e){
                ctx.editMessageText(message + ".", keyboard);
            }
        }
    }
    
    private last_transactions = async (ctx: UContext, next: boolean, current_page: number, address: string) => {
        let message = "";
        let keyboard;
        const transactions: Interfaces.ITransactionData[] = await this.transactionHistoryService.findManyByCriteria({ address: address });
        if (next){
            const start = transactions.length - (5 *(current_page + 1));
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
            const start = Math.min(transactions.length - (5 * (current_page - 1)), transactions.length - 5);
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

    private get_coingecko_ticker(): string | undefined {
        const ticker = this.configuration.get("ticker");
        if (ticker === undefined || typeof ticker !== "string") return undefined;
        return ticker;
    }
}