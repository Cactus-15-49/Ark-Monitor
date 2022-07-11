import { Context } from "telegraf";
import { Utils } from "@solar-network/crypto";

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

export enum TransactionsTypes {
    vote,
    transfer,
    burn
}

export interface simplified_transaction {
    type: TransactionsTypes,
    id: string,
    sender: string,
    recipient: string | undefined,
    amount: Utils.BigNumber,
    delegates: Array<any>
}