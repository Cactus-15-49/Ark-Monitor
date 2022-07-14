import { Managers, Utils } from "@solar-network/crypto";
import { Contracts } from "@solar-network/kernel";

import { BigIntToBString } from "./utils";

export class messageComposer {
    private message: string;

    public constructor(message?: string) {
        this.message = message || "";
    }

    public get() {
        if (this.message.slice(-1) === "\n") {
            return this.message.slice(0, -1);
        }
        return this.message;
    }

    public len() {
        return this.message.length;
    }

    public set(message: string) {
        this.message = message;
        return this;
    }

    public add(message: string) {
        this.message += message;
        return this;
    }

    public addnl(message: string) {
        this.message += message + "\n";
        return this;
    }

    public nl() {
        this.message += "\n";
        return this;
    }

    public spc() {
        this.message += " ";
        return this;
    }

    public addwallet(wallet: Contracts.State.Wallet, ownAddresses?: string[]) {
        this.add(
            wallet.hasAttribute("delegate.username") ? wallet.getAttribute("delegate.username") : wallet.getAddress(),
        );

        if (ownAddresses && ownAddresses.find((add) => add === wallet.getAddress())) {
            this.spc().add("⭐");
        }
        return this;
    }

    public addshrtwallet(wallet: Contracts.State.Wallet | string, link?: string) {
        const address = typeof wallet === "string" ? wallet : wallet.getAddress();
        let addressString = `${address.slice(0, 5)}...${address.slice(-5)}`;
        if (link) {
            addressString = `<a href="${link}/wallets/${address}">${addressString}</a>`;
        }
        this.add(addressString);
        return this;
    }

    public addAmount(amount: Utils.BigNumber, precision: number, includeSymbol?: boolean) {
        this.message += BigIntToBString(amount, precision);
        if (includeSymbol) {
            this.message += ` ${this.get_symbol()}`;
        }
        return this;
    }

    private get_symbol() {
        return Managers.configManager.get("network").client.symbol;
    }
}
