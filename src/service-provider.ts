import { Providers , Container, Contracts} from "@solar-network/core-kernel";
import { Telegram_bot } from "./Telegram-bot";
import { message_handler } from "./handlers/messages_handler";
import { callback_handler } from "./handlers/callback_handler";
import { display_transactions } from "./utils/display_transactions";
import { alerts_handler } from "./alerts/alerts_handler";
import { Database } from "./database/controller";
import { init } from "./handlers/routes/init";
import { last_transactions } from "./handlers/routes/last_transactions";
import { menu } from "./handlers/routes/menu";
import { notifications } from "./handlers/routes/notifications";
import { send_feedback } from "./handlers/routes/send_feedback";
import { settings } from "./handlers/routes/settings";
import { menu_utils } from "./handlers/menu_utils"

export class ServiceProvider extends Providers.ServiceProvider {
    
    public async register(): Promise<void> {
        this.app.bind(Symbol.for("TeMonitor<Telegram_bot>")).to(Telegram_bot);
        this.app.bind(Symbol.for("message_handler")).to(message_handler).inSingletonScope();
        this.app.bind(Symbol.for("callback_handler")).to(callback_handler);
        this.app.bind(Symbol.for("display_transactions")).to(display_transactions);
        this.app.bind(Symbol.for("alerts_handler")).to(alerts_handler).inSingletonScope();
        this.app.bind(Symbol.for("database")).to(Database).inSingletonScope();
        this.app.bind(Symbol.for("init")).to(init);
        this.app.bind(Symbol.for("last_transactions")).to(last_transactions);
        this.app.bind(Symbol.for("menu")).to(menu);
        this.app.bind(Symbol.for("notifications")).to(notifications);
        this.app.bind(Symbol.for("send_feedback")).to(send_feedback);
        this.app.bind(Symbol.for("settings")).to(settings);
        this.app.bind(Symbol.for("menu_utils")).to(menu_utils);

    }
    
    
    public async boot(): Promise<void> {
        this.app.get<Database>(Symbol.for("database")).connect();
        await this.app.get<alerts_handler>(Symbol.for("alerts_handler")).start();
        this.app.get<Telegram_bot>(Symbol.for("TeMonitor<Telegram_bot>")).start();
        this.app.get<Contracts.Kernel.Logger>(Container.Identifiers.LogService).info("Telegram BOT started!");
    }



    
    public async dispose(): Promise<void> {
        //
    }

    public async required(): Promise<boolean> {
        return false;
    }
}
