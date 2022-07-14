import { Container, Providers } from "@solar-network/kernel";
import mongoose from "mongoose";

import { Delegate, DUser, Voter } from "../interfaces";
import { delegates, users, voters } from "./models";

@Container.injectable()
export class Database {
    @Container.inject(Container.Identifiers.PluginConfiguration)
    @Container.tagged("plugin", "@cactus1549/ark-monitor")
    private readonly configuration!: Providers.PluginConfiguration;

    public connect() {
        mongoose.connect(`mongodb://127.0.0.1/${this.configuration.get("databaseName")}`, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            useFindAndModify: false,
            useCreateIndex: true,
        });
    }

    public async create_user(chat_id: number): Promise<DUser> {
        const user = new users({ chat_id: chat_id });
        user.save(function (err, res) {
            if (err) return console.error(err);
        });
        return user;
    }

    public async enter_menu(chat_id: number, current_state: Array<string>, menu: string, go_back: number = 0) {
        let new_state_array = current_state;
        if (go_back > 0) {
            new_state_array = current_state.splice(0, new_state_array.length - go_back);
        }
        const new_state = `${new_state_array.join("/")}/${menu}`;
        await users.findOneAndUpdate({ chat_id }, { state: new_state });
    }

    public async create_voter(chat_id: number, address: string): Promise<Voter> {
        const voter = new voters({ chat_id: chat_id, address: address });
        voter.save(function (err, res) {
            if (err) return console.error(err);
        });
        return voter;
    }

    public async change_root(chat_id: number, menu: string) {
        await users.findOneAndUpdate({ chat_id }, { state: menu });
    }

    public async go_back(chat_id: number, current_state: Array<string>, times: number = 1): Promise<string[]> {
        const new_state_array = current_state.splice(0, current_state.length - times);
        const new_state = new_state_array.join("/");
        await users.findOneAndUpdate({ chat_id }, { state: new_state });
        return new_state_array;
    }

    public async create_delegate(chat_id: number, username: string, address: string): Promise<Delegate> {
        const delegate = new delegates({ chat_id: chat_id, address: address, username: username });
        delegate.save(function (err, res) {
            if (err) return console.error(err);
        });
        return delegate;
    }

    public async update_alerts_voter(
        chat_id: number,
        address: string,
        Rednodes: string,
        Out_of_forging: string,
        Transactions: string,
    ) {
        await voters.findOneAndUpdate({ chat_id, address }, { Rednodes, Out_of_forging, Transactions });
    }

    public async update_alerts_delegate(
        chat_id: number,
        username: string,
        Missing: string,
        Position: string,
        Votes: string,
        Voters: string,
    ) {
        await delegates.findOneAndUpdate({ chat_id, username }, { Missing, Position, Votes, Voters });
    }

    public async delete_delegate(chat_id: number, username: string) {
        await delegates.findOneAndDelete({ chat_id, username });
    }

    public async change_voter_name(chat_id: number, address: string, name: string) {
        await voters.findOneAndUpdate({ chat_id, address }, { name });
    }

    public async delete_voter(chat_id: number, address: string) {
        await voters.findOneAndDelete({ chat_id, address });
    }

    public async get_user(chat_id: number): Promise<DUser> {
        const user = await users.findOne({ chat_id });
        if (user === null) {
            try {
                await this.create_user(chat_id);
            } catch (error) {
                //
            }
            return { chat_id: chat_id, state: "start", extra_delegates: 1, extra_voters: 1, voters: [], delegates: [] };
        }
        return user;
    }

    public async get_delegates(chat_id: number): Promise<Delegate[]> {
        return await delegates.find({ chat_id });
    }

    public async get_delegates_from_username(username: string): Promise<Delegate[]> {
        return await delegates.find({ username });
    }

    public async get_all_delegates_Missing(username: string): Promise<Delegate[]> {
        return await delegates.find({ username, Missing: "ON" });
    }

    public async get_voters(chat_id: number): Promise<Voter[]> {
        return await voters.find({ chat_id });
    }

    public async get_all_voters_outForging(): Promise<Voter[]> {
        return await voters.find({ Out_of_forging: "ON" });
    }

    public async get_all_voters_Rednodes(): Promise<Voter[]> {
        return await voters.find({ Rednodes: "ON" });
    }

    public async get_voter_by_address_and_transaction(address: string): Promise<Voter[]> {
        return await voters.find({ address, Transactions: "ON" });
    }
}
