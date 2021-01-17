
import { Container, Contracts, Providers } from "@arkecosystem/core-kernel";
import { Telegraf } from "telegraf";
import { UContext } from "./interfaces";

@Container.injectable()
export class Telegram_bot{

    @Container.inject(Container.Identifiers.LogService)
    private readonly logger!: Contracts.Kernel.Logger;

    @Container.inject(Symbol.for("message_handler"))
    private readonly message_handler;

    @Container.inject(Symbol.for("callback_handler"))
    private readonly callback_handler;

    @Container.inject(Symbol.for("database"))
    private readonly db;

    @Container.inject(Container.Identifiers.PluginConfiguration)
    @Container.tagged("plugin", "@cactus1549/telegram-bot")
    private readonly configuration!: Providers.PluginConfiguration;


    private bot;

        

    public async start(){
        let token: string | undefined = this.configuration.get("telegram_token");
        if (!token){ this.logger.error("Token not set. qutting"); return; }
        this.bot = new Telegraf(token);
        this.message_handler.setup();
        this.bot.use(async (ctx, next) => {
            if (ctx.from) {
                if (ctx.message != undefined){
                    ctx.text = ctx.message.text;
                    ctx.chat_id = ctx.message.chat.id;
                }
                if (ctx.callbackQuery != undefined){
                    ctx.chat_id = ctx.callbackQuery.message.chat.id;
                }
                ctx.user = await this.db.get_user(ctx.chat_id); 
                ctx.user.delegates = await this.db.get_delegates(ctx.chat_id);
                ctx.user.voters = await this.db.get_voters(ctx.chat_id);
                ctx.user.states = ctx.user.state.split("/");
                
              }
              return next();
          })

        this.bot.on('message', (ctx: UContext) => {
            if (ctx.message != undefined)
                this.message_handler.handle(ctx);
            
        })

        this.bot.on('callback_query', (ctx: UContext) =>{
            this.callback_handler.handle(ctx);
        })
        this.bot.launch();
    }
}




