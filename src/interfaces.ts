import { Context } from "telegraf";

export interface Delegate {
    chat_id: number,
    username: string,
    address: string,
    Missing: string,
    Position: string,
    Votes: string,
    Voters: string
}

export interface Voter {
    chat_id: number,
    address: string,
    name: string | undefined,
    Rednodes: string,
    Out_of_forging: string,
    Transactions: string
}

export interface User {
    chat_id: number,
    state: string,
    states: string[],
    extra_delegates: number,
    extra_voters: number,
    voters: Array<Voter>,
    delegates: Array<Delegate> 

}

export interface DUser {
    chat_id: number,
    state: string,
    extra_delegates: number,
    extra_voters: number,
    voters: Array<Voter>,
    delegates: Array<Delegate> 

}

export interface missed_block {
    missed: number,
    pkey: string
}

export interface UContext extends Context{
    user: User,
    text: string,
    chat_id: number
}