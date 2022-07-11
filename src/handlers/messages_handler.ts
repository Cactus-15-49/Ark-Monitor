import { Container, Contracts } from "@solar-network/kernel";
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
                    'both': this.init.both,
                    '/back': (ctx: UContext)=> { this.menu_utils.handle_back(ctx, 1, "", this.init.init)}
                },
                'voter': {
                    'buttons': {
                        'text': this.init.voter_check,
                        '/back': (ctx: UContext)=> { this.menu_utils.handle_back(ctx, 1 , "", this.init.init)}
                    },
                    'name': {
                        'any': {
                            'buttons': {
                                '/continue': this.init.skip_add_name,
                                'text': this.init.add_name
                            }
                        }
                    }
                },
                'delegate': {
                    'buttons': {
                        '/continue': this.init.skip_delegate,
                        'text': this.init.delegate_check,
                        '/back': (ctx: UContext)=> { this.menu_utils.handle_back(ctx, 1 , "", this.init.init)}
                    }
                },
                'both': {
                    'buttons': {
                        'text': this.init.voter_check,
                        '/back': (ctx: UContext)=> { this.menu_utils.handle_back(ctx, 1 , "", this.init.init)}
                    },
                    'name': {
                        'any': {
                            'buttons': {
                                '/continue': this.init.skip_add_name,
                                'text': this.init.add_name
                            }
                        }
                    }
                }
            },
            'Dmenu': {
                'buttons': {
                    'delegates info': this.menu.delegates_info,
                    'last transactions': this.menu.last_transactions,
                    'price': this.menu.price,
                    'rednodes': this.menu.rednodes,
                    'notifications': this.menu.delegate_notifications,
                    'links': this.menu.links,
                    'send feedback': this.menu.send_feedback,
                    'go to voters': this.menu.change_menu,
                    'settings': this.menu.settings,
                    'bot info': this.menu.info,
                    '/back': (ctx: UContext)=> { this.menu_utils.handle_back(ctx, 1, "", undefined)}
                },
                'last_transaction': {
                    'buttons': {
                        'text': this.last_transactions.display_transactions,
                        '/back': (ctx: UContext)=> { this.menu_utils.handle_back(ctx, 1, "", undefined)}
                    }
                },
                'notifications': {
                    'buttons': {
                        'text': this.notifications.choose_delegate,
                        '/back': (ctx: UContext)=> { this.menu_utils.handle_back(ctx, 1, "", undefined)}
                    },
                    'delegate': {
                        'any': {
                            'buttons': {
                                'text': this.notifications.change_notification_delegate,
                                '/back': (ctx: UContext)=> { this.menu_utils.handle_back(ctx, 3, "", this.menu.delegate_notifications)}
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
                        '/back': (ctx: UContext)=> { this.menu_utils.handle_back(ctx, 1, "", undefined)}
                    }
                },
                'settings': {
                    'buttons': {
                        '+add': this.settings.delegate_add,
                        'text': this.settings.delegate_main,
                        "+add voter": this.settings.voter_add_from_delegate,
                        '/back': (ctx: UContext)=> { this.menu_utils.handle_back(ctx, 1 , "", undefined)}
                    },
                    'add': {
                        'buttons': {
                            'text': this.settings.check_username,
                            '/back': (ctx: UContext)=> { this.menu_utils.handle_back(ctx, 1, "", this.menu.settings)}
                        }
                    },
                    'add_voter': {
                        'buttons': {
                            'text': this.settings.check_address,
                            '/back': (ctx: UContext)=> { this.menu_utils.handle_back(ctx, 1, "", this.menu.settings)}
                        },
                        'any': {
                            'buttons' : {
                                '/continue': (ctx: UContext)=> { this.menu_utils.handle_back(ctx, 2, "", this.menu.settings)},
                                'text': this.settings.add_name_settings
                            }
                        }
                    },
                    'any': {
                        'buttons': {
                            'delete': this.settings.delete_delegate,
                            '/back': (ctx: UContext)=> { this.menu_utils.handle_back(ctx, 1, "", this.menu.settings)}
                        },
                        'delete':{
                            'buttons': {
                                'yes' : this.settings.confirm_delete_username,
                                'no' : (ctx: UContext)=> { this.menu_utils.handle_back(ctx, 1, ctx.user.states[2] , this.settings.delegate_main)},
                                '/back': (ctx: UContext)=> { this.menu_utils.handle_back(ctx, 1, ctx.user.states[2] , this.settings.delegate_main)}
                            }
                        }
                    }
        
                }
            },
            'Vmenu': {
                'buttons': {
                    'balance': this.menu.balance,
                    'last transactions': this.menu.last_transactions,
                    'price': this.menu.price,
                    'rednodes': this.menu.rednodes,
                    'notifications': this.menu.voter_notifications,
                    'links': this.menu.links,
                    'send feedback': this.menu.send_feedback,
                    'go to delegates': this.menu.change_menu,
                    'settings': this.menu.settings,
                    'bot info': this.menu.info,
                    '/back': (ctx: UContext)=> { this.menu_utils.handle_back(ctx, 1, "", undefined)}
                },
                'last_transaction': {
                    'buttons': {
                        'text': this.last_transactions.display_transactions,
                        '/back': (ctx: UContext)=> { this.menu_utils.handle_back(ctx, 1, "", undefined)}
                    }
                },
                'notifications': {
                    'buttons': {
                        'text': this.notifications.choose_voter,
                        '/back': (ctx: UContext)=> { this.menu_utils.handle_back(ctx, 1, "", undefined)}
                    },
                    'wallet': {
                        'any': {
                            'buttons': {
                                'text': this.notifications.change_notification_voter,
                                '/back': (ctx: UContext)=> { this.menu_utils.handle_back(ctx, 3, "", this.menu.voter_notifications)}
                            }
                        }
                    }
                },
                'feedback': {
                    'buttons': {
                        'text' : this.send_feedback.send_send_feedback,
                        '/back': (ctx: UContext)=> { this.menu_utils.handle_back(ctx, 1, "", undefined)}
                    }
                },
                'settings': {
                    'buttons': {
                        '+add': this.settings.voter_add,
                        '+add delegate': this.settings.delegate_add_from_voter,
                        'text': this.settings.voter_main,
                        '/back': (ctx: UContext)=> { this.menu_utils.handle_back(ctx, 1, "", undefined)}
                    },
                    'add': {
                        'buttons': {
                            'text': this.settings.check_address,
                            '/back': (ctx: UContext)=> { this.menu_utils.handle_back(ctx, 1, "", this.menu.settings)}
                        },
                        'any': {
                            'buttons' : {
                                '/continue': (ctx: UContext)=> { this.menu_utils.handle_back(ctx, 2, "", this.menu.settings)},
                                'text': this.settings.add_name_settings
                            }
                        }
                    },
                    'add_delegate': {
                        'buttons': {
                            'text': this.settings.check_username,
                            '/back': (ctx: UContext)=> { this.menu_utils.handle_back(ctx, 1, "", this.menu.settings)}
                        }
                    },
                    'any': {
                        'buttons': {
                            'delete': this.settings.delete_address,
                            'add name': this.settings.change_name,
                            'change name': this.settings.change_name,
                            '/back': (ctx: UContext)=> { this.menu_utils.handle_back(ctx, 1, "", this.menu.settings)}
                        },
                        'delete':{
                            'buttons': {
                                'yes' : this.settings.confirm_delete_address,
                                'no' : (ctx: UContext)=> { this.menu_utils.handle_back(ctx, 1, ctx.user.states[2] , this.settings.voter_main)},
                                '/back': (ctx: UContext)=> { this.menu_utils.handle_back(ctx, 1, ctx.user.states[2] , this.settings.voter_main)}
                            }
                        },
                        'change': {
                            'buttons': {
                                'text': this.settings.confirm_change_name,
                                '/back': (ctx: UContext)=> { this.menu_utils.handle_back(ctx, 1, ctx.user.states[2] , this.settings.voter_main)}
                            }
                        }
                    }
                }
            }
        }
    }



    public handle = (ctx: UContext) => {
        const states = ctx.user.states;
        let i_state = this.menu_tree;
        for (const state of states){
            if (state in i_state){
                i_state = i_state[state];
            }else if ('any' in i_state){
                i_state = i_state['any'];
            }
            else{
                throw new Error(`invalid state! (current state: ${states})`);
            }
        }

        const message = ctx.text.toLowerCase();
        const buttons = i_state["buttons"];
        this.logger.debug(`${ctx.chat_id} [${states}]: ${message}`);
        if (message in buttons && message !== 'text'){
            buttons[message](ctx);
        } else if ('text' in buttons){
            buttons['text'](ctx);
        }else {
            ctx.reply("Invalid input. Please use your keyboard or use the /Back command if you feel like you are stuck here :)");
        }
    }
 
    

}