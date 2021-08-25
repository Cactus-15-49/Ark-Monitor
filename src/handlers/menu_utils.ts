import { Container, Contracts, Providers } from "@arkecosystem/core-kernel";
import { Markup } from "telegraf";
import { UContext } from "../interfaces";



@Container.injectable()
export class menu_utils {

    @Container.inject(Container.Identifiers.LogService)
    private readonly logger!: Contracts.Kernel.Logger;

    @Container.inject(Symbol.for("database"))
    private readonly db;

    @Container.inject(Container.Identifiers.PluginConfiguration)
    @Container.tagged("plugin", "@cactus1549/ark-monitor")
    private readonly configuration!: Providers.PluginConfiguration;

    public async handle_back(ctx: UContext, number_back: number, text: string, callback){
        const current_states: string[] = ctx.user.states;
        const states_array_length = current_states.length;
        if (states_array_length <= number_back + 1 ){
            if (current_states[0] == "init"){
                ctx.user.states = ["start"];
                this.db.change_root(ctx.chat_id, "start");
            }else {
                if (number_back >= 1 && states_array_length > 1)
                    ctx.user.states = await this.db.go_back(ctx.chat_id, ctx.user.states, number_back);
                this.display_menu(ctx);
                return;
            }
        }else{
            ctx.user.states = await this.db.go_back(ctx.chat_id, ctx.user.states, number_back + 1);
        }
        ctx.text = text;
        callback(ctx);
    }

    public async display_menu(ctx: UContext){
        this.logger.debug(`${ctx.chat_id} sent to menu`)
        const delegates = await this.db.get_delegates(ctx.chat_id);
        const voters = await this.db.get_voters(ctx.chat_id);
        if (delegates.length == 0){
            ctx.reply('MENU',
                        {reply_markup: Markup.keyboard([["Balance", "Last transactions"], ["Rednodes", "Price"],
                        ["Notifications", "Links"], ["Send feedback", "Bot Info"], ["Settings"]])})
        }else if (voters.length == 0){
            ctx.reply('MENU\n',
                            {reply_markup: Markup.keyboard([["Delegates info", "Last transactions"], [" Price", "Rednodes"],
                            ["Notifications", "Links"], ["Send feedback", "Settings"], ["Bot Info"]])})
        }
        else {
            const user = await this.db.get_user(ctx.chat_id); 
            if (user.state.split("/")[0] == "Dmenu"){
                ctx.reply(`${this.get_delegate_name().toUpperCase()} MENU`,
                                 {reply_markup: Markup.keyboard([["Delegates info", "Last transactions"], ["Price", "Rednodes"],
                                    ["Notifications", "Links"], ["Send feedback", "Go to Voters"],
                                    ["Bot Info", "Settings"]])})
            }else{
                ctx.reply('VOTER MENU\n',
                             {reply_markup: Markup.keyboard([["Balance", "Last transactions"], ["Rednodes", "Price"],
                                ["Notifications", "Links"], ["Send feedback", ""], ["Go to Delegates"],
                                ["Settings", "Bot Info"]])})
            }
        }
    }

    private get_delegate_name(): string {
        const delegate_name_config = this.configuration.get("delegate_name");
        if (delegate_name_config === undefined || typeof delegate_name_config !== "string") return "delegate";
        return delegate_name_config;
    }

    
    

}