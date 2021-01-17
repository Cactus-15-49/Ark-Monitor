import { Container, Contracts, Providers } from "@arkecosystem/core-kernel";
import { Markup } from "telegraf";
import { UContext } from "../../interfaces";



@Container.injectable()
export class settings {

    @Container.inject(Container.Identifiers.WalletRepository)
    @Container.tagged("state", "blockchain")
    private readonly wallets!: Contracts.State.WalletRepository;

    @Container.inject(Symbol.for("menu_utils"))
    private readonly menu_utils;

    @Container.inject(Symbol.for("menu"))
    private readonly menu;

    @Container.inject(Symbol.for("database"))
    private readonly db;

    @Container.inject(Container.Identifiers.PluginConfiguration)
    @Container.tagged("plugin", "@cactus1549/telegram-bot")
    private readonly configuration!: Providers.PluginConfiguration;


    
    

    public delegate_add = (ctx: UContext)=>  {
        if (ctx.user.delegates.length <= this.get_base_delegates() + ctx.user.extra_delegates){
            ctx.reply(`Insert your ${this.get_delegate_name()} username here`,  {reply_markup: Markup.keyboard([["/Back"]])});
            this.db.enter_menu(ctx.chat_id, ctx.user.states, "add");
        }
        else
            ctx.reply(`You have inserted the max number of unverified ${this.get_delegate_name()}s. 
                            Please verify or delete one account before adding a new one.`)
    }

    public delegate_add_from_voter = (ctx: UContext)=>  {
        if (ctx.user.delegates.length == 0){
            ctx.reply(`Insert your ${this.get_delegate_name()} username here`,  {reply_markup: Markup.keyboard([["/Back"]])});
            this.db.enter_menu(ctx.chat_id, ctx.user.states, "add_delegate");
        }
        else
            ctx.reply(`You shouldn't be using that here :thinking:`)
    }
    
    public delegate_main = (ctx: UContext)=>  {
        let choice = ctx.user.delegates.find(delegate => delegate.username == ctx.text || delegate.address == ctx.text);
        if (choice != undefined){
            this.db.enter_menu(ctx.chat_id, ctx.user.states, choice.address);
            ctx.reply(`You are modyfing the ${this.get_delegate_name()} ${choice.username}.\nChoose what you want to do.`,  {reply_markup: Markup.keyboard([["delete"],["/Back"]])})
        }else{
            ctx.reply("Use your keyboard please.");
        }
    }
    
    public check_username = (ctx: UContext)=>  {
        const username: string = ctx.text;
        let wallet: Contracts.State.Wallet;
        try{
            wallet = this.wallets.findByUsername(username.toLowerCase());
        }catch (error){
            ctx.reply(`This username is not registered as ${this.get_delegate_name()}. `, {reply_markup: Markup.keyboard([["/Back"]])});
            return;
        }
        if (wallet.hasAttribute("delegate.resigned") && wallet.getAttribute("delegate.resigned")) ctx.reply(`You can't add resigned ${this.get_delegate_name()}s. `, {reply_markup: Markup.keyboard([["/Back"]])});
        else if (ctx.user.delegates.some((delegate) => wallet.getAttribute("delegate.username") ===  delegate.username)) ctx.reply(`You have already inserted this address as a ${this.get_delegate_name()}. Please insert another ${this.get_delegate_name()} username.`, {reply_markup: Markup.keyboard([["/Back"]])});
        else {
            let username = wallet.getAttribute("delegate.username");
            let address = wallet.address;
            this.db.create_delegate(ctx.chat_id, username, address);
            ctx.reply(`Inserted ${username} as a ${this.get_delegate_name()}.`,  {reply_markup: Markup.keyboard([["/Back"]])})
        }
    }
    
    public delete_delegate = (ctx: UContext)=>  {
        if (ctx.user.delegates.length + ctx.user.voters.length <= 1){
            ctx.reply("You can't have 0 voters and delegates. Add a delegate or voter to delete this.")
            return;
        }
        let delegate = ctx.user.delegates.find((wallet) => wallet.address == ctx.user.states[2])!;
        ctx.reply(`Are you sure you want to delete ${delegate.username} (${delegate.address}).`,  {reply_markup: Markup.keyboard([["yes"], ["no"]])});
        this.db.enter_menu(ctx.chat_id, ctx.user.states, "delete")
    }
    
    public confirm_delete_username = (ctx: UContext)=>  {
        let delegate = ctx.user.delegates.find((delegate) => delegate.address == ctx.user.states[2])!;
        if (ctx.text === "yes"){
            this.db.delete_delegate(ctx.chat_id, delegate.username)
            ctx.reply(`Delegate ${delegate.username} deleted.`);
            if (ctx.user.delegates.length <= 1){
                this.db.change_root(ctx.chat_id, "Vmenu")
                this.menu_utils.display_menu(ctx);
                return;
            }
            let old_delegates = ctx.user.delegates
            ctx.user.delegates = old_delegates.filter(delegate => (delegate.address != ctx.user.states[3]));
            this.menu_utils.handle_back(ctx, 3, "", this.menu.settings);
        }
    }
       
    public voter_add = (ctx: UContext)=>  {
        if (ctx.user.voters.length <= this.get_base_voters() + ctx.user.extra_voters){
            ctx.reply(`Insert your wallet address here`,  {reply_markup: Markup.keyboard([["/Back"]])})
            this.db.enter_menu(ctx.chat_id, ctx.user.states, "add")
        }
        else
            ctx.reply("You have inserted the max number of unverified voters. Please verify or delete one account before adding a new one.")
    }

    public voter_add_from_delegate = (ctx: UContext) =>  {
        if (ctx.user.voters.length == 0){
            ctx.reply(`Insert your wallet address here`,  {reply_markup: Markup.keyboard([["/Back"]])})
            this.db.enter_menu(ctx.chat_id, ctx.user.states, "add_voter");
        }
        else
            ctx.reply(`You shouldn't be using that here :thinking:`)
    }
    
    public voter_main = (ctx: UContext)=>  {
        let choice = ctx.user.voters.find((wallet) => wallet.name == ctx.text || wallet.address === ctx.text);
        if (choice != undefined){
            this.db.enter_menu(ctx.chat_id, ctx.user.states, choice.address)
            let row: string[] = [];
            row.push("delete");
            let message: string;
            if (choice.name != undefined){
                row.push("change name")
                message = `You are modifying the address ${choice.address} also known as ${choice.name}.\nChoose what you want to do.`
            }else{
                row.push("add name")
                message = `You are modifying the address ${choice.address}.\nChoose what you want to do.`
            }
            ctx.reply(message,  {reply_markup: Markup.keyboard([row, ["/Back"]])})
        }else{
            ctx.reply("Use your keyboard please.");
        }
    }
    
    public check_address = (ctx: UContext)=>  {
        const AddressOrUsername: string = ctx.text;
        let wallet: Contracts.State.Wallet;
        if (AddressOrUsername.length <= 20){
            try {
                wallet = this.wallets.findByUsername(AddressOrUsername.toLowerCase());
            }catch (error){
                ctx.reply("Invalid wallet address. Try again or press /Back to go back.",  {reply_markup: Markup.keyboard([["/Back"]])});
                return;
            }
        }
        else{
            wallet = this.wallets.findByAddress(AddressOrUsername);
        }
        if (wallet.publicKey){
            if (ctx.user.voters.some((voter) => wallet.address ===  voter.address)) {ctx.reply("You have already inserted this address as a voter. Please insert another address.", {reply_markup: Markup.keyboard([["/Back"]])}); return;}
            let address = wallet.address;
            ctx.reply(`Inserted the address ${address} as a voter address.`)
            this.db.create_voter(ctx.chat_id, address);
            ctx.reply("Do you want to add a name for this address? Write it down or press continue",  {reply_markup: Markup.keyboard([["/Continue"]])})
            this.db.enter_menu(ctx.chat_id, ctx.user.states, address);
        }else{
            ctx.reply("Invalid wallet address. Try again or press /Back to go back.",  {reply_markup: Markup.keyboard([["/Back"]])});
        }
    }
    
    public add_name_settings = (ctx: UContext)=>  {
        let name: string = ctx.text;
        let pattern = /^[a-zA-Z0-9_ -]*$/;
        if (name.length < 2 || !pattern.test(name) || name.length > 25){
            ctx.reply("The name should be shorter than 25 characters and can only contain alphanumeric characters, spaces and - or _. Try with another name.",  {reply_markup: Markup.keyboard([["/Continue"]])})
        }else if(ctx.user.voters.some((voter) => name ===  voter.name)){
            ctx.reply("This name already exist. Try with another name.",  {reply_markup: Markup.keyboard([["/Continue"]])})
            
        }else{
            this.db.change_voter_name(ctx.chat_id, ctx.user.states[3], name);
            ctx.reply(`The wallet ${ctx.user.states[3]} is now renamed ${name}`)
            let old_voters = ctx.user.voters;
            ctx.user.voters = old_voters.map(voter => {
                if (voter.address == ctx.user.states[3]) voter.name = name;
                return voter;
            })
            this.menu_utils.handle_back(ctx, 2, "", this.menu.settings);
        }  
    }

    
    public delete_address = (ctx: UContext)=>  {
        if (ctx.user.delegates.length + ctx.user.voters.length <= 1){
            ctx.reply("You can't have 0 voters and delegates. Add a delegate or voter to delete this.")
            return;
        }
        let wallet = ctx.user.voters.find((wallet) => wallet.address == ctx.user.states[2])!;
        let message: string = "Are you sure you want to delete ";
        if (wallet.name != undefined)
            message += `${wallet.name} (${wallet.address}).`
        else
            message += `${wallet.address}.`
        this.db.enter_menu(ctx.chat_id, ctx.user.states, "delete")
        ctx.reply(message,  {reply_markup: Markup.keyboard([["yes"], ["no"]])})
    }
    
    public change_name = (ctx: UContext)=>  {
        ctx.reply("Write down the new name: ",  {reply_markup: Markup.keyboard([["/Back"]])})
        this.db.enter_menu(ctx.chat_id, ctx.user.states, "change")
    }
    
    public confirm_delete_address = (ctx: UContext)=>  {
        let voter = ctx.user.voters.find((wallet) => wallet.address == ctx.user.states[2])!;
        if (ctx.text === "yes"){
            this.db.delete_voter(ctx.chat_id, ctx.user.states[2])
            ctx.reply(`Wallet ${voter.name || voter.address} deleted.`);
            if (ctx.user.voters.length <= 1){
                this.db.change_root(ctx.chat_id, "Dmenu")
                this.menu_utils.display_menu(ctx);
                return
            }
            let old_voters = ctx.user.voters
            ctx.user.voters = old_voters.filter(voter => (voter.address != ctx.user.states[2]));
            this.menu_utils.handle_back(ctx, 2, "", this.menu.settings);
        }
    }
    
    public confirm_change_name = (ctx: UContext)=>  {
        let name: string = ctx.text;
        let pattern = /^[a-zA-Z0-9_ -]*$/;
        if (name.length < 2 || !pattern.test(name) || name.length > 25){
            ctx.reply("The name should be shorter than 25 characters and can only contain alphanumeric characters, spaces and - or _. Try with another name.",  {reply_markup: Markup.keyboard([["/Continue"]])})
        }else if(ctx.user.voters.some((voter) => name ===  voter.name)){
            ctx.reply("This name already exist. Try with another name.",  {reply_markup: Markup.keyboard([["/Continue"]])})
            
        }else{
            this.db.change_voter_name(ctx.chat_id, ctx.user.states[2], name);
            ctx.reply(`The wallet ${ctx.user.states[2]} is now renamed ${name}`);
            let old_voters = ctx.user.voters;
            ctx.user.voters = old_voters.map(voter => {
                if (voter.address == ctx.user.states[2]) voter.name = name;
                return voter;
            })
            this.menu_utils.handle_back(ctx, 1, ctx.user.states[2] , this.voter_main)
        }
    }

    private get_base_delegates(){
        let config_base_delegates = this.configuration.get("base_delegates");
        if (config_base_delegates === undefined || typeof config_base_delegates !== "number") return 5;
        return config_base_delegates;
    }

    private get_base_voters() {
        let config_base_voters = this.configuration.get("base_voters");
        if (config_base_voters === undefined || typeof config_base_voters !== "number") return 5;
        return config_base_voters;
    }

    private get_delegate_name() {
        return this.configuration.get("delegate_name");
    }

    
}