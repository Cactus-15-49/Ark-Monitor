import { Container, Providers } from "@solar-network/core-kernel";
import { Markup } from "telegraf";
import { UContext } from "../../interfaces";


@Container.injectable()
export class notifications {

    @Container.inject(Symbol.for("database"))
    private readonly db;

    @Container.inject(Container.Identifiers.PluginConfiguration)
    @Container.tagged("plugin", "@cactus1549/ark-monitor")
    private readonly configuration!: Providers.PluginConfiguration;


    public choose_voter = (ctx: UContext)=> {
        const choice = ctx.user.voters.find((wallet) => wallet.name == ctx.text || wallet.address == ctx.text);
        if (choice !== undefined){
            this.db.enter_menu(ctx.chat_id, ctx.user.states, "wallet/" + choice.address)
            ctx.reply(`REDNODES notify you when a ${this.get_delegate_name()} you are voting misses blocks.'
                '\nOUT OF FORGING notify you when the ${this.get_delegate_name()} you are voting become an active/standby ${this.get_delegate_name()} 
                '\nPAYMENTS notify you when you receive/send coins.`)
            ctx.reply('Choose the notification you want to turn on or off',  {reply_markup: Markup.keyboard(
                    [['Rednodes: ' + choice.Rednodes, "Out of Forging: " + choice.Out_of_forging],
                    ["Payments: " + choice.Transactions],
                    ["/Back"]])});
        }else{
            ctx.reply("Invalid input. Please use your keyboard or go /Back if you are stuck.")
        }
    }

    public change_notification_voter = (ctx: UContext)=> {
        const voter = ctx.user.voters.find((wallet) => wallet.address == ctx.user.states[3])!;
        const text = ctx.text;
        const possible_notifications = ['Rednodes: ' + voter.Rednodes,"Out of Forging: " + voter.Out_of_forging, "Payments: " + voter.Transactions];
        const keyboard = () => { return [['Rednodes: ' + voter.Rednodes, "Out of Forging: " + voter.Out_of_forging],
                                                    ["Payments: " + voter.Transactions],
                                                    ["/Back"]]};

        if (text == possible_notifications[0]){
            if (voter.Rednodes == "OFF")
                voter.Rednodes = "ON";
            else
                voter.Rednodes = "OFF";
            ctx.reply(`REDNODES turned ${voter.Rednodes}.`,  {reply_markup: Markup.keyboard(keyboard())});
        }
        else if (text == possible_notifications[1]){
            if (voter.Out_of_forging == "OFF")
                voter.Out_of_forging = "ON";
            else
                voter.Out_of_forging = "OFF";
            ctx.reply(`OUT OF FORGING turned ${voter.Out_of_forging}.`,  {reply_markup: Markup.keyboard(keyboard())});
        }
        else if (text == possible_notifications[2]){
            if (voter.Transactions == "OFF")
                voter.Transactions = "ON";
            else
                voter.Transactions = "OFF";
            ctx.reply(`PAYMENTS turned ${voter.Transactions}.`, {reply_markup: Markup.keyboard(keyboard())}); 
        }
        this.db.update_alerts_voter(ctx.chat_id, voter.address, voter.Rednodes, voter.Out_of_forging, voter.Transactions);
    }

    public choose_delegate = (ctx: UContext)=> {
        const choice = ctx.user.delegates.find((wallet) => wallet.username == ctx.text);
        if (choice !== undefined){
            this.db.enter_menu(ctx.chat_id, ctx.user.states, "delegate/" + choice.address)
            ctx.reply(`'REDNODE notify you when your ${this.get_delegate_name()} misses blocks. 
            \nPOSITION notify you when your ${this.get_delegate_name()} make a change in rank.'
            \nVOTES notify when there is a change in your votes amount.'
            \nVOTERS notify when someone vote/unvote you.`)
            let keyboard;
            if (choice.Votes === "OFF"){
                keyboard = [['Rednode: ' + choice.Missing, "Position: " + choice.Position],
                    ["Votes: " + choice.Votes, "Voters: " + choice.Voters],
                    ["/Back"]]
            }else{
                keyboard = [['Rednode: ' + choice.Missing, "Position: " + choice.Position],
                    ["Votes: ON/Cap: " + choice.Votes, "Voters: " + choice.Voters],
                    ["/Back"]]
            }
            ctx.reply('Choose the notification you want to turn on or off',  {reply_markup: Markup.keyboard(keyboard)}); 
        }else{
            ctx.reply("Invalid input. Please use your keyboard or go /Back if you are stuck.")
        }
    }

    public change_notification_delegate = (ctx: UContext)=> {
        const delegate = ctx.user.delegates.find((wallet) => wallet.address == ctx.user.states[3])!;
        const text = ctx.text;
        const possible_notifications = ['Rednode: ' + delegate.Missing,"Position: " + delegate.Position, ["Votes: " + delegate.Votes, "Votes: ON/Cap: " + delegate.Votes], "Voters: " + delegate.Voters];
        const keyboard = () => { 
            if (delegate.Votes == "OFF")
                return [['Rednode: ' + delegate.Missing, "Position: " + delegate.Position], ["Votes: " + delegate.Votes, "Voters: " + delegate.Voters], ["/Back"]];
            return  [['Rednode: ' + delegate.Missing, "Position: " + delegate.Position], ["Votes: ON/Cap: " + delegate.Votes, "Voters: " + delegate.Voters], ["/Back"]];
        };

        if (text == possible_notifications[0]){
            if (delegate.Missing == "OFF")
                delegate.Missing = "ON";
            else
                delegate.Missing = "OFF";
            ctx.reply(`REDNODE turned ${delegate.Missing}.`,  {reply_markup: Markup.keyboard(keyboard())});
        }
        else if (text == possible_notifications[1]){
            if (delegate.Position == "OFF")
                delegate.Position = "ON";
            else
                delegate.Position = "OFF";
            ctx.reply(`POSITION turned ${delegate.Position}.`,  {reply_markup: Markup.keyboard(keyboard())});
        }
        else if (possible_notifications[2].includes(text)){
            if (delegate.Votes == "OFF"){
                this.db.enter_menu(ctx.chat_id, ctx.user.states, "cap")
                ctx.reply("Insert the minimum amount of vote changes that should trigger a notification",
                                {reply_markup: Markup.keyboard([["/Back"]])})
            }
            else{
                delegate.Votes = "OFF";
                ctx.reply(`VOTES turned ${delegate.Votes}.`,  {reply_markup: Markup.keyboard(keyboard())}); 
            }      
        }
        else if (text == possible_notifications[3]){
            if (delegate.Voters == "OFF")
                delegate.Voters = "ON";
            else
                delegate.Voters = "OFF";
            ctx.reply(`VOTERS turned ${delegate.Voters}.`,  {reply_markup: Markup.keyboard(keyboard())}); 
        }
        this.db.update_alerts_delegate(ctx.chat_id, delegate.username ,delegate.Missing, delegate.Position, delegate.Votes, delegate.Voters);
    }

    public change_cap = (ctx: UContext)=> {
        const text = ctx.text;
        const delegate = ctx.user.delegates.find((wallet) => wallet.address == ctx.user.states[3])!;
        const keyboard = () => { 
            if (delegate.Votes == "OFF")
                return [['Rednode: ' + delegate.Missing, "Position: " + delegate.Position], ["Votes: " + delegate.Votes, "Voters: " + delegate.Voters], ["/Back"]];
            return  [['Rednode: ' + delegate.Missing, "Position: " + delegate.Position], ["Votes: ON/Cap: " + delegate.Votes, "Voters: " + delegate.Voters], ["/Back"]];
        };
        if (text == "/Back"){
            this.db.go_back(ctx.chat_id, ctx.user.states);
            ctx.reply('VOTES remain OFF.',  {reply_markup: Markup.keyboard(keyboard())})
        }
        else{
            const value = Number(text);
            if (isNaN(value)){
                ctx.reply("Send a number")
            }else{
                this.db.go_back(ctx.chat_id, ctx.user.states);
                delegate.Votes = text;
                ctx.reply(`VOTES turned ON with a cap of ${value}.`,  {reply_markup: Markup.keyboard(keyboard())})
                this.db.update_alerts_delegate(ctx.chat_id, delegate.username ,delegate.Missing, delegate.Position, delegate.Votes, delegate.Voters);
            }
        }
    }

    private get_delegate_name(){
        return this.configuration.get("delegate_name");
    } 
}