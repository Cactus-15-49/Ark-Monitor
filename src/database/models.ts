import mongoose, { Schema, Document } from "mongoose";
import {Delegate, Voter, DUser, missed_block} from "../interfaces";

let users_schema: Schema = new Schema({
  chat_id:        { type: Number, required: true, unique: true },
  state:          { type: String, default: "start" },
  extra_delegates:{ type: Number, default: 0},
  extra_voters:   { type: Number, default: 0}
});

let delegate_schema: Schema = new Schema({
    chat_id:        { type: Number, required: true },
    username:       { type: String, required: true },
    address:        { type: String, required: true },
    Missing:        { type: String, default: "ON"},
    Position:       { type: String, default: "ON" },
    Votes:          { type: String, default: "300"},
    Voters:         { type: String, default: "ON"} 
});
delegate_schema.index({ chat_id: 1, username: 1}, { unique: true });

let voters_schema: Schema = new Schema({
    chat_id:        { type: Number, required: true },
    address:        { type: String, required: true },
    name:           { type: String, required: false },
    Rednodes:       { type: String, default: "ON"},
    Out_of_forging: { type: String, default: "ON" },
    Transactions:   { type: String, default: "ON"}
});
voters_schema.index({ chat_id: 1, address: 1}, { unique: true });

let missed_blocks_schema: Schema = new Schema({
    username:       { type: String, required: true },
    p_key:          { type: String, required: true },
    round:          { type: Number, required: true },
    consecutive:    { type: Number, required: true },
});
missed_blocks_schema.index({ username: 1, round: 1}, { unique: true });



export let users = mongoose.model<DUser & Document>("users", users_schema);
export let delegates = mongoose.model<Delegate & Document>("delegates", delegate_schema);
export let voters = mongoose.model<Voter & Document>("voters", voters_schema);
export let missed_blocks = mongoose.model<missed_block & Document>("missed_blocks", missed_blocks_schema);