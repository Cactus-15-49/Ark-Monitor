import { Container, Contracts, Providers } from "@arkecosystem/core-kernel";
import { Managers } from "@arkecosystem/crypto";
import { Markup } from "telegraf";
import { UContext } from "../../interfaces";

@Container.injectable()
export class init {

    @Container.inject(Container.Identifiers.WalletRepository)
    @Container.tagged("state", "blockchain")
    private readonly wallets!: Contracts.State.WalletRepository;

    @Container.inject(Symbol.for("menu_utils"))
    private readonly menu_utils;

    @Container.inject(Symbol.for("database"))
    private readonly db;

    @Container.inject(Container.Identifiers.PluginConfiguration)
    @Container.tagged("plugin", "@cactus1549/telegram-bot")
    private readonly configuration!: Providers.PluginConfiguration;
    
    


    public init = (ctx: UContext) => {
        this.db.change_root(ctx.chat_id, "init");
        ctx.reply(`Welcome to the ${this.get_token()} Telegram bot.\nAre you a voter, ${this.get_delegate_name()} or both?\n\nTip: Always use the keyboard unless you get asked to write something!`,  {reply_markup: Markup.keyboard([["voter", this.get_delegate_name()], ["both"]])});
    }
    
    public voter = (ctx: UContext) => {
        this.db.enter_menu(ctx.chat_id, ctx.user.states, "voter");
        ctx.reply("Please write down your public wallet address.",  {reply_markup: Markup.keyboard(["/Back"])});
    }
    
    public delegate = (ctx: UContext) => {
        this.db.enter_menu(ctx.chat_id, ctx.user.states, "delegate");
        ctx.reply(`Please send your ${this.get_token()} username`,  {reply_markup: Markup.keyboard(["/Back"])});
    }
    
    public both = (ctx: UContext) => {
        this.db.enter_menu(ctx.chat_id, ctx.user.states, "both");
        ctx.reply("Please write down your public wallet address.",  {reply_markup: Markup.keyboard(["/Back"])})
    }
    
    public voter_check = (ctx: UContext) => {
        const AddressOrUsername = ctx.text;
        const chat_id = ctx.chat_id;
        let wallet: Contracts.State.Wallet;
        if (AddressOrUsername.length <= 20){
            try {
                wallet = this.wallets.findByUsername(AddressOrUsername.toLowerCase());
            }catch (error){
                ctx.reply("Invalid wallet address. Try again or press /Back to go back.", {reply_markup: Markup.keyboard(["/Back"])});
                return;
            }
        }
        else{
            wallet = this.wallets.findByAddress(AddressOrUsername);
        }
        if (wallet.publicKey){
            this.db.create_voter(chat_id, wallet.address);
            ctx.reply("Wallet address saved.");
            ctx.reply("Do you want to give a name to this wallet?\nWrite it down or hit the /Continue button to skip",  {reply_markup: Markup.keyboard(["/Continue"])});
            this.db.enter_menu(chat_id, ctx.user.states, `name/${wallet.address}`)
        }else{
            ctx.reply("Invalid wallet address. Try again or press /Back to go back.",  {reply_markup: Markup.keyboard(["/Back"])});
        }
    }
    
    public add_name = (ctx: UContext) => {
        let name = ctx.text;
        const chat_id = ctx.chat_id;
        let pattern = /^[a-zA-Z0-9_ -]*$/;
        if (name.length < 2 || !pattern.test(name) || name.length > 25){
            ctx.reply("The name should be shorter than 25 characters and can only contain alphanumeric characters, spaces and - or _. Try with another name.",  {reply_markup: Markup.keyboard(["/Continue"])});
        }else if(ctx.user.voters.some((voter) => name ===  voter.name)){
            ctx.reply("This name already exist. Try with another name.",  {reply_markup: Markup.keyboard([["/Continue"]])})
            
        }else{
            this.db.change_voter_name(ctx.chat_id, ctx.user.states[3], name);
            if (ctx.user.states[1] == "voter"){
                this.db.change_root(chat_id, "Vmenu");
                this.menu_utils.display_menu(ctx);
            }
            else{
                this.db.enter_menu(chat_id, ctx.user.states, "delegate", 3);
                ctx.reply(`Please send your ${this.get_delegate_name()} username or press /Continue to continue without inserting any ${this.get_delegate_name()}.`,  {reply_markup: Markup.keyboard(["/Continue"])});
            }
        }
    }

    public skip_add_name = (ctx: UContext) => {
        const chat_id = ctx.chat_id;
        if (ctx.user.states[1] == "voter"){
            this.db.change_root(chat_id, "Vmenu");
            this.menu_utils.display_menu(ctx);
        }
        else{
            this.db.enter_menu(chat_id, ctx.user.states, "delegate", 3);
            ctx.reply(`Please send your ${this.get_delegate_name()} username or press /Continue to continue without inserting any ${this.get_delegate_name()}.`,  {reply_markup: Markup.keyboard(["/Continue"])})
        }
    }

    
    public delegate_check = async (ctx: UContext) => {
        const username = ctx.text;
        let wallet: Contracts.State.Wallet
        try{
            wallet = this.wallets.findByUsername(username.toLowerCase());
        }catch (error) {
            ctx.reply(`This username is not registered as ${this.get_delegate_name()}. Try again or you can go /Back .`,  {reply_markup: Markup.keyboard(["/Back"])});
            return;
        }
        if (wallet.hasAttribute("delegate.resigned") && wallet.getAttribute("delegate.resigned")) ctx.reply(`You can't add resigned ${this.get_delegate_name()}s. Try again or you can go /Back .`,  {reply_markup: Markup.keyboard(["/Back"])});
        else {
            await this.db.create_delegate(ctx.chat_id, wallet.getAttribute("delegate.username"), wallet.address);
            this.db.change_root(ctx.chat_id, "Dmenu")
            ctx.reply(`${this.get_delegate_name()} saved.`)
            this.menu_utils.display_menu(ctx);
        }
        
    }

    public skip_delegate = (ctx: UContext) => {
        if (ctx.user.voters.length){
            ctx.reply("Nice try. You have to insert a username.");
        }
        else{
            this.db.change_root(ctx.chat_id, "Vmenu")
            this.menu_utils.display_menu(ctx);
        }
    }

    private get_delegate_name(): string {
        let config_delegate_name = this.configuration.get("delegate_name");
        if (config_delegate_name === undefined || typeof config_delegate_name !== "string") return "delegate";
        return config_delegate_name;
    }

    private get_token() {
        Managers.configManager.get("network").client.token;
    } 
}