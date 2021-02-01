import { Container, Providers } from "@arkecosystem/core-kernel";
import { UContext } from "../../interfaces";


@Container.injectable()
export class send_feedback {

    @Container.inject(Symbol.for("menu_utils"))
    private readonly menu_utils;

    @Container.inject(Container.Identifiers.PluginConfiguration)
    @Container.tagged("plugin", "@cactus1549/ark-monitor")
    private readonly configuration!: Providers.PluginConfiguration;


    public send_send_feedback = (ctx: UContext)=> {
        const text = ctx.text;
        ctx.reply("Feedback sent.");
        for (const admin of this.get_admins()){
            ctx.telegram.sendMessage(admin,"New feedback\n" + text)
        }
        this.menu_utils.handle_back(ctx, 1, "", undefined);
    }

    private get_admins() {
        const config_admin_ids = this.configuration.get("admin_id");
        if (config_admin_ids === undefined || !Array.isArray(config_admin_ids)) return [];
        return config_admin_ids;
    }
}