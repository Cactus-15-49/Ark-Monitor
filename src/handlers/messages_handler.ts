import { Container, Contracts } from "@arkecosystem/core-kernel";
import { UContext } from "../interfaces";





@Container.injectable()
export class message_handler {

    @Container.inject(Container.Identifiers.LogService)
    private readonly logger!: Contracts.Kernel.Logger;

    @Container.inject(Symbol.for("menu"))
    private readonly menu;

    @Container.inject(Symbol.for("init"))
    private readonly init;

    @Container.inject(Symbol.for("last_transactions"))
    private readonly last_transactions;

    @Container.inject(Symbol.for("notifications"))
    private readonly notifications;

    @Container.inject(Symbol.for("send_feedback"))
    private readonly send_feedback;

    @Container.inject(Symbol.for("settings"))
    private readonly settings;

    @Container.inject(Symbol.for("menu_utils"))
    private readonly menu_utils;

    private menu_tree;

    public setup(){
        this.logger.info("DIOCANE")
        this.logger.info(this.init);
        this.menu_tree = {
            'start':{
                'buttons': {
                    'text': this.init.init
                }
            },
            'init': {
                'buttons': {
                    'voter': this.init.voter,
                    'delegate': this.init.delegate,
                    'both': this.init.both
                },
                'voter': {
                    'buttons': {
                        'text': this.init.voter_check,
                        '/Back': (ctx: UContext)=> { this.menu_utils.handle_back(ctx, 1 , "", this.init.init)}
                    },
                    'name': {
                        'any': {
                            'buttons': {
                                '/Continue': this.init.skip_add_name,
                                'text': this.init.add_name
                            }
                        }
                    }
                },
                'delegate': {
                    'buttons': {
                        '/Continue': this.init.skip_delegate,
                        'text': this.init.delegate_check,
                        '/Back': (ctx: UContext)=> { this.menu_utils.handle_back(ctx, 1 , "", this.init.init)}
                    }
                },
                'both': {
                    'buttons': {
                        'text': this.init.voter_check,
                        '/Back': (ctx: UContext)=> { this.menu_utils.handle_back(ctx, 1 , "", this.init.init)}
                    }
                }
            },
            'Dmenu': {
                'buttons': {
                    'Delegates info': this.menu.delegates_info,
                    'Last transactions': this.menu.last_transactions,
                    'Price': this.menu.price,
                    'Rednodes': this.menu.rednodes,
                    'Notifications': this.menu.delegate_notifications,
                    'Links': this.menu.links,
                    'Send feedback': this.menu.send_feedback,
                    'Go to Voters': this.menu.change_menu,
                    'Settings': this.menu.settings,
                    'Bot Info': this.menu.info
                },
                'last_transaction': {
                    'buttons': {
                        'text': this.last_transactions.display_transactions,
                        '/Back': (ctx: UContext)=> { this.menu_utils.handle_back(ctx, 1, "", undefined)}
                    }
                },
                'notifications': {
                    'buttons': {
                        'text': this.notifications.choose_delegate,
                        '/Back': (ctx: UContext)=> { this.menu_utils.handle_back(ctx, 1, "", undefined)}
                    },
                    'delegate': {
                        'any': {
                            'buttons': {
                                'text': this.notifications.change_notification_delegate,
                                '/Back': (ctx: UContext)=> { this.menu_utils.handle_back(ctx, 3, "", this.menu.delegate_notifications)}
                            },
                            'cap': {
                                'buttons': {
                                    'text': this.notifications.change_cap,
                                    //'/Back': (ctx: UContext)=> { this.menu_utils.handle_back(ctx, 3, ctx.user.states[3], this.choose_delegate )}
                                }
                            }
                        }
                    }
                },
                'feedback': {
                    'buttons': {
                        'text' : this.send_feedback.send_send_feedback,
                        '/Back': (ctx: UContext)=> { this.menu_utils.handle_back(ctx, 1, "", undefined)}
                    }
                },
                'settings': {
                    'buttons': {
                        '+Add': this.settings.delegate_add,
                        'text': this.settings.delegate_main,
                        "+Add voter": this.settings.voter_add_from_delegate,
                        '/Back': (ctx: UContext)=> { this.menu_utils.handle_back(ctx, 1 , "", undefined)}
                    },
                    'add': {
                        'buttons': {
                            'text': this.settings.check_username,
                            '/Back': (ctx: UContext)=> { this.menu_utils.handle_back(ctx, 1, "", this.menu.settings)}
                        }
                    },
                    'add_voter': {
                        'buttons': {
                            'text': this.settings.check_address,
                            '/Back': (ctx: UContext)=> { this.menu_utils.handle_back(ctx, 1, "", this.menu.settings)}
                        },
                        'any': {
                            'buttons' : {
                                '/Continue': (ctx: UContext)=> { this.menu_utils.handle_back(ctx, 2, "", this.menu.settings)},
                                'text': this.settings.add_name_settings
                            }
                        }
                    },
                    'any': {
                        'buttons': {
                            'delete': this.settings.delete_delegate,
                            '/Back': (ctx: UContext)=> { this.menu_utils.handle_back(ctx, 1, "", this.menu.settings)}
                        },
                        'delete':{
                            'buttons': {
                                'yes' : this.settings.confirm_delete_username,
                                'no' : (ctx: UContext)=> { this.menu_utils.handle_back(ctx, 1, ctx.user.states[2] , this.settings.delegate_main)},
                                '/Back': (ctx: UContext)=> { this.menu_utils.handle_back(ctx, 1, ctx.user.states[2] , this.settings.delegate_main)}
                            }
                        }
                    }
        
                }
            },
            'Vmenu': {
                'buttons': {
                    'Balance': this.menu.balance,
                    'Last transactions': this.menu.last_transactions,
                    'Price': this.menu.price,
                    'Rednodes': this.menu.rednodes,
                    'Notifications': this.menu.voter_notifications,
                    'Links': this.menu.links,
                    'Send feedback': this.menu.send_feedback,
                    'Go to Delegates': this.menu.change_menu,
                    'Settings': this.menu.settings,
                    'Bot Info': this.menu.info
                },
                'last_transaction': {
                    'buttons': {
                        'text': this.last_transactions.display_transactions,
                        '/Back': (ctx: UContext)=> { this.menu_utils.handle_back(ctx, 1, "", undefined)}
                    }
                },
                'notifications': {
                    'buttons': {
                        'text': this.notifications.choose_voter,
                        '/Back': (ctx: UContext)=> { this.menu_utils.handle_back(ctx, 1, "", undefined)}
                    },
                    'wallet': {
                        'any': {
                            'buttons': {
                                'text': this.notifications.change_notification_voter,
                                '/Back': (ctx: UContext)=> { this.menu_utils.handle_back(ctx, 3, "", this.menu.voter_notifications)}
                            }
                        }
                    }
                },
                'feedback': {
                    'buttons': {
                        'text' : this.send_feedback.send_send_feedback,
                        '/Back': (ctx: UContext)=> { this.menu_utils.handle_back(ctx, 1, "", undefined)}
                    }
                },
                'settings': {
                    'buttons': {
                        '+Add': this.settings.voter_add,
                        '+Add delegate': this.settings.delegate_add_from_voter,
                        'text': this.settings.voter_main,
                        '/Back': (ctx: UContext)=> { this.menu_utils.handle_back(ctx, 1, "", undefined)}
                    },
                    'add': {
                        'buttons': {
                            'text': this.settings.check_address,
                            '/Back': (ctx: UContext)=> { this.menu_utils.handle_back(ctx, 1, "", this.menu.settings)}
                        },
                        'any': {
                            'buttons' : {
                                '/Continue': (ctx: UContext)=> { this.menu_utils.handle_back(ctx, 2, "", this.menu.settings)},
                                'text': this.settings.add_name_settings
                            }
                        }
                    },
                    'add_delegate': {
                        'buttons': {
                            'text': this.settings.check_username,
                            '/Back': (ctx: UContext)=> { this.menu_utils.handle_back(ctx, 1, "", this.menu.settings)}
                        }
                    },
                    'any': {
                        'buttons': {
                            'delete': this.settings.delete_address,
                            'add name': this.settings.change_name,
                            'change name': this.settings.change_name,
                            '/Back': (ctx: UContext)=> { this.menu_utils.handle_back(ctx, 1, "", this.menu.settings)}
                        },
                        'delete':{
                            'buttons': {
                                'yes' : this.settings.confirm_delete_address,
                                'no' : (ctx: UContext)=> { this.menu_utils.handle_back(ctx, 1, ctx.user.states[2] , this.settings.voter_main)},
                                '/Back': (ctx: UContext)=> { this.menu_utils.handle_back(ctx, 1, ctx.user.states[2] , this.settings.voter_main)}
                            }
                        },
                        'change': {
                            'buttons': {
                                'text': this.settings.confirm_change_name,
                                '/Back': (ctx: UContext)=> { this.menu_utils.handle_back(ctx, 1, ctx.user.states[2] , this.settings.voter_main)}
                            }
                        }
                    }
                }
            }
        }
    }



    public handle = (ctx: UContext) => {
        let states = ctx.user.states;
        let action = this.menu_tree;
        for (let single of states){

            if (single in action){
                action = action[single];
            }else if ('any' in action){
                action = action['any'];
            }
            else{
                throw new Error(`invalid state! (current state: ${states})`);
            }
        }
        let message = ctx.text;
        let buttons = action["buttons"];
        this.logger.debug(`${ctx.chat_id} [${states}]: ${message}`);
        if (message in buttons && message != 'text'){
            buttons[message](ctx);
        } else if ('text' in buttons){
            buttons['text'](ctx);
        }else {
            ctx.reply("Use your keyboard :)");
        }
    }
 
    

}