"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleAccountClient = void 0;
const fs = require("fs-extra");
const base_puppeteer_1 = require("base-puppeteer");
const textverified_1 = require("textverified");
const totp_generator_1 = __importDefault(require("totp-generator"));
const mkdirp_1 = __importDefault(require("mkdirp"));
const path_1 = __importDefault(require("path"));
const totp_generator_2 = __importDefault(require("totp-generator"));
const generate_password_1 = require("generate-password");
const faker_1 = require("@faker-js/faker");
const logger_1 = require("./logger");
const smspinverify_1 = require("smspinverify");
const logger = (0, logger_1.getLogger)();
const timeout = async (n) => await new Promise((resolve) => setTimeout(resolve, n));
const getOTP = async function (token, fn, goBack) {
    const textVerified = new textverified_1.TextVerifiedClient({
        simpleAccessToken: token,
    });
    const checkers = await textVerified.simpleAuthenticate();
    //console.log("checkers: ", checkers);
    const code = await (async () => {
        while (true) {
            const verification = await (async () => {
                while (true) {
                    try {
                        return await textVerified.createVerification({ id: 33 });
                    }
                    catch (e) {
                        this.logger.error(e);
                        await timeout(30000);
                        this.logger.error("retry");
                    }
                }
            })();
            const poll = async () => {
                await fn(verification.number);
                await timeout(1000);
                for (let i = 0; i < 10; i++) {
                    this.logger.info("poll OTP ...");
                    const status = await textVerified.getVerification({
                        id: verification.id,
                    });
                    if (status.code) {
                        this.logger.info("got OTP: " + status.code);
                        return status.code;
                    }
                    await timeout(1000);
                }
                return false;
            };
            const result = await poll();
            if (!result) {
                await goBack();
                await timeout(1000);
                continue;
            }
            return result;
        }
    })();
    return code;
};
const getOTPFromSmsPinVerify = async function (token, fn, goBack, app = "Gmail USA", ticks = 10) {
    const smspinverify = new smspinverify_1.SmsPinVerifyClient({
        apiKey: token,
    });
    const code = await (async () => {
        while (true) {
            const verification = await (async () => {
                while (true) {
                    try {
                        return {
                            number: await smspinverify.getNumber({
                                country: "USA",
                                app,
                            }),
                        };
                    }
                    catch (e) {
                        this.logger.error(e);
                        await timeout(30000);
                        this.logger.error("retry");
                    }
                }
            })();
            const poll = async () => {
                await fn(verification.number);
                await timeout(1000);
                for (let i = 0; i < ticks; i++) {
                    this.logger.info("poll OTP ...");
                    const status = await smspinverify.getSms({
                        country: "USA",
                        app,
                        number: verification.number,
                    });
                    const match = status.match(/(?:\d{6})/g);
                    if (match) {
                        const code = match[0].replace("G-", "");
                        this.logger.info("got OTP: " + code);
                        return code;
                    }
                    await timeout(1000);
                }
                return false;
            };
            const result = await poll();
            if (!result) {
                try {
                    await goBack();
                }
                catch (e) {
                    this.logger.info("back button failed, trying anyway to proceed");
                }
                await timeout(1000);
                continue;
            }
            return result;
        }
    })();
    return code;
};
class GoogleAccountClient extends base_puppeteer_1.BasePuppeteer {
    async saveToBitwarden() {
        await super.saveToBitwarden({
            username: this.email,
            password: this.password,
            name: "gapps " + this.email,
            totp: this.totpSecret,
            uris: ["androidapp://com.google.android.gms", "https://google.com"],
        });
        if (this.appPassword)
            await super.saveToBitwarden({
                username: this.email,
                password: this.appPassword,
                name: this.email + " app password",
                uris: ["androidapp://eu.faircode.email"],
            });
        return { success: true };
    }
    async getOTP(fn, goBack) {
        return await getOTP.call(this, this.textVerifiedToken || process.env.TEXTVERIFIED_TOKEN, fn, goBack);
    }
    async getOTPFromSmsPinVerify(fn, goBack, app = "Gmail USA", ticks = 10) {
        return await getOTPFromSmsPinVerify.call(this, process.env.SMSPINVERIFY_TOKEN, fn, goBack, app, ticks);
    }
    async goToForwarding() {
        const page = this._page;
        await page.goto("https://gmail.com");
        await page.waitForSelector('a[aria-label="Settings"]');
        await page.click('a[aria-label="Settings"]');
        await page.waitForSelector('button[aria-label="See all settings"]');
        await page.click('button[aria-label="See all settings"]');
        await timeout(5000);
        await page.evaluate(() => [].slice
            .call(document.querySelectorAll("div a"))
            .find((v) => v.innerText.match("Forwarding"))
            .click());
    }
    async forwardEmail({ to }) {
        await this.goToForwarding();
        const page = this._page;
        await page.waitForSelector('input[type="button"][act="add"]');
        await page.click('input[type="button"][act="add"]');
        await page.waitForSelector("div[id$=contentEl] input");
        await page.type("div[id$=contentEl] input", to);
        const newPagePromise = new Promise((resolve) => this._browser.once("targetcreated", (target) => resolve(target.page())));
        await page.click('button[name="next"]');
        const popup = await newPagePromise;
        await popup.waitForSelector('input[value="Proceed"]');
        await popup.click('input[value="Proceed"]');
        await page.waitForSelector('button[name="ok"]');
        await page.click('button[name="ok"]');
        return { success: true };
    }
    async enterForwardingConfirmationCode({ code, action }) {
        action = action || "read";
        await this.goToForwarding();
        const page = this._page;
        try {
            const el = await page.$('input[type="text"][act="verifyText"]');
            await el.click({ clickCount: 3 });
            await el.type(String(code));
            await timeout(1000);
        }
        catch (e) { }
        try {
            await page.evaluate(() => document.querySelector('input[type="button"][act="verify"]').click());
            await timeout(1000);
        }
        catch (e) { }
        await page.waitForSelector('input[type="radio"][name="sx_em"]');
        await timeout(100);
        await page.evaluate(() => document.querySelectorAll('input[type="radio"][name="sx_em"]')[1].click());
        await timeout(100);
        await page.evaluate(() => {
            const el = [].slice
                .call(document.querySelectorAll("select"))
                .filter((v) => [].slice.call(v.children).length === 4)
                .find((v) => [].slice.call(v.children).find((v) => v.value === "read"));
            el.value = "read";
        });
        await timeout(100);
        await page.evaluate(() => [].slice
            .call(document.querySelectorAll("button"))
            .find((v) => v.innerText === "Save Changes")
            .click());
        await timeout(100);
        await page.waitForSelector("div.UI");
        return { success: true };
    }
    async toMuttrc({ username, password, name }) {
        username = username || this.email.split("@").slice(0, -1).join("@");
        const appassword = this.appPassword || password;
        password = this.appPassword || password;
        name = name || "Google User";
        const muttDirectory = path_1.default.join(process.env.HOME, ".mutt");
        await (0, mkdirp_1.default)(muttDirectory);
        const muttrcPath = path_1.default.join(muttDirectory, "muttrc");
        await fs.writeFile(muttrcPath, `set from = "${username}@gmail.com"\nset realname = "${name}"\nset imap_user = "${username}@gmail.com"\nset imap_pass = "${appassword}"\nset smtp_url = "smtps://${username}@smtp.gmail.com"\nset smtp_pass = "${password}"\nset folder = "imaps://imap.gmail.com/"\nset spoolfile = "+INBOX"\nset postponed = "+[Gmail]/Drafts"\nset record = "+[Gmail]/Sent Mail"\nset trash = "+[Gmail]/Trash"`);
    }
    async needsPassword() {
        const page = this._page;
        return Boolean(await page.evaluate(() => Boolean(document.querySelector('input[type="password"]')) &&
            Boolean(document.querySelector('div[role="presentation"] div[data-is-consent="false"] button'))));
    }
    async enterPassword() {
        const page = this._page;
        this.logger.info("reauthenticate");
        await this.type({
            selector: 'input[type="password"]',
            value: this.password,
            stealth: true,
        });
        await this.timeout({ n: 500 });
        await this.click({
            selector: 'div[role="presentation"] div[data-is-consent="false"] button',
        });
        await this.timeout({ n: 500 });
    }
    async changePassword({ newPassword }) {
        const page = this._page;
        await page.goto("https://myaccount.google.com/signinoptions/password");
        await timeout(5000);
        if (await this.needsPassword()) {
            await this.enterPassword();
            await timeout(5000);
        }
        await page.type('input[name="password"]', newPassword);
        await page.type('input[name="confirmation_password"]', newPassword);
        await timeout(50);
        await page.click('button[type="submit"]');
        this.password = newPassword;
        await timeout(1000);
        return { success: true };
    }
    async sendVoice({ to, message }) {
        const page = this._page;
        await page.goto("https://voice.google.com/messages", { waitUntil: "load" });
        await timeout(500);
        await page.waitForSelector('div[gv-id="send-new-message"][aria-disabled="false"]');
        await page.click('div[gv-id="send-new-message"]');
        await page.waitForSelector('input[gv-test-id="recipient-picker-input"]');
        await page.type('input[gv-test-id="recipient-picker-input"]', to);
        await page.click("div#stp2");
        await page.waitForSelector('textarea[gv-test-id="gv-message-input"]');
        await page.type('textarea[gv-test-id="gv-message-input"]', message);
        await page.click("button#ib2");
        return { success: true };
    }
    async verifyVoice({ city }) {
        const fetchOTP = this.getOTPFromSmsPinVerify.bind(this);
        await this.goto({ url: "https://voice.google.com/u/0/signup" });
        await this.timeout({ n: 1000 });
        const page = this._page;
        const selected = await page.evaluate(async () => {
            while (true) {
                let selector = "button.mat-flat-button";
                if (document.querySelector(selector))
                    return selector;
                selector = "input#searchAccountPhoneSearchBar";
                if (document.querySelector(selector))
                    return selector;
                await new Promise((resolve) => setTimeout(resolve, 250));
            }
        });
        if (selected === "button.mat-flat-button") {
            await this.click({ selector: "button.mat-flat-button" });
            await this.waitForSelector({
                selector: "input#searchAccountPhoneSearchBar",
            });
        }
        await page.type("input#searchAccountPhoneSearchBar", city, { delay: 200 });
        await this.waitForSelector({
            selector: "button.mat-focus-indicator.mat-button.mat-button-base.mat-primary",
        });
        await this.click({
            selector: "button.mat-focus-indicator.mat-button.mat-button-base.mat-primary",
        });
        await this.waitForSelector({ selector: "button[mat-flat-button]" });
        await this.click({ selector: "button[mat-flat-button]" });
        await this.waitForSelector({ selector: "input[mat-input]" });
        const otp = await fetchOTP(async (number) => {
            await page.type("input[mat-input]", String(number), { delay: 100 });
            await this.timeout({ n: 100 });
            await this.click({ selector: 'button[aria-label="Send code"]' });
        }, async () => {
            await this.click({ selector: 'button[aria-label="Cancel"]' });
            await this.timeout({ n: 100 });
            await this.click({ selector: "button[mat-flat-button]" });
            await this.timeout({ n: 100 });
        }, "Google Voice", 50);
        await page.type('input[name="verify-code"]', otp, { delay: 100 });
        await this.waitForSelector({
            selector: 'md-dialog-actions gv-flat-button button[aria-label="Verify"]',
        });
        await this.timeout({ n: 400 });
        await this.click({
            selector: 'md-dialog-actions gv-flat-button button[aria-label="Verify"]',
        });
        await this.waitForSelector({ selector: 'button[aria-label="Finish"]' });
        await this.timeout({ n: 400 });
        await this.click({ selector: 'button[aria-label="Finish"]' });
        await this.waitForSelector({ selector: 'button[aria-label="Settings"]' });
        await this.click({ selector: 'button[aria-label="Settings"]' });
    }
    async enable2fa({ smspinverify }) {
        const fetchOTP = smspinverify
            ? this.getOTPFromSmsPinVerify.bind(this)
            : this.getOTP.bind(this);
        const page = this._page;
        this.logger.info("open enroll 2FA");
        await page.goto("https://myaccount.google.com/signinoptions/two-step-verification/enroll-welcome");
        await timeout(5000);
        await this.click({ selector: 'div[role="main"] button' });
        await timeout(5000);
        if (await this.needsPassword()) {
            await this.enterPassword();
            await timeout(5000);
        }
        /*
        const no2fa = await page.evaluate(() => {
          return Boolean(document.querySelector('input[type="tel"]'));
        });
        if (!no2fa){
          return {"done": "true", "message": "2fa already enabled"}
        }
        */
        const number = await fetchOTP(async (number) => {
            await page.click('input[type="tel"]', { clickCount: 3 });
            await this.type({
                selector: 'input[type="tel"]',
                value: number,
                stealth: true,
            });
            await this.click({
                selector: "c-wiz > div:nth-child(1) > div:nth-child(1) > div:nth-child(3) > div:nth-child(2) > div:nth-child(1) > div:nth-child(3) > div:nth-child(1)",
            });
        }, async () => {
            await this.click({
                selector: 'c-wiz > div > div > div:nth-child(3) div[role="button"]',
            });
        });
        await this.type({
            selector: 'input[type="text"][maxlength="8"]',
            value: number,
            stealth: true,
        });
        await this.timeout({ n: 800 });
        await this.click({
            selector: "c-wiz > div:nth-child(1) > div:nth-child(1) > div:nth-child(3) > div:nth-child(2) > div:nth-child(1) > div:nth-child(3) > div:nth-child(1)",
        });
        this.logger.info("entered OTP");
        await timeout(5000);
        this.logger.info("turning on 2FA");
        await this.click({
            selector: "c-wiz > div:nth-child(1) > div:nth-child(1) > div:nth-child(3) > div:nth-child(2) > div:nth-child(1) > div:nth-child(3) > div:nth-child(2)",
        });
        await timeout(5000);
        await this.getTotpSecret();
    }
    async getTotpSecret() {
        const page = this._page;
        await page.goto("https://myaccount.google.com/signinoptions/two-step-verification");
        await this.waitForSelector({ selector: 'div[role="main"] > c-wiz > div > div > div > div:nth-child(12) > div:nth-child(3) div[role="presentation"] a' });
        await this._page.click('div[role="main"] > c-wiz > div > div > div > div:nth-child(12) > div:nth-child(3) div[role="presentation"] a');
        await timeout(5000);
        await this.click({ selector: 'div[role="main"] button' });
        await this.waitForSelector({ selector: "center span" });
        await this.click({ selector: "center span" });
        await timeout(500);
        const totpSecret = await page.evaluate(() => document.querySelector("ol li:nth-child(2) strong").innerText);
        const t = (0, totp_generator_1.default)(totpSecret.replace(/\s/g, ""));
        await page.evaluate(() => {
            const els = [].slice
                .call(document.querySelectorAll("div[data-is-touch-wrapper] button[data-id][data-idom-class]"))
                .filter((v) => v.innerText === "Next");
            (els[3] || els[1]).click();
        });
        await timeout(800);
        await this.type({
            selector: 'input[type="text"]',
            value: t,
            stealth: true,
        });
        await page.evaluate(() => {
            const els = [].slice
                .call(document.querySelectorAll("div[data-is-touch-wrapper] button[data-id][data-idom-class]"))
                .filter((v) => v.innerText === "Verify");
            (els[3] || els[1]).click();
        });
        await timeout(5000);
        this.logger.info("2FA added!");
        this.logger.info("totp secret: " + totpSecret);
        this.totpSecret = totpSecret;
        return totpSecret;
    }
    async enableAppPassword() {
        const page = this._page;
        await page.goto("https://myaccount.google.com/apppasswords");
        await timeout(1000);
        if (await this.needsPassword()) {
            await this.enterPassword();
            await timeout(5000);
        }
        await timeout(5000);
        await page.evaluate(async () => {
            [].slice
                .call(document.querySelectorAll('div[role="option"]'))
                .find((v) => v.innerText.match("Select app"))
                .click();
            await new Promise((resolve) => setTimeout(resolve, 1000));
            [].slice
                .call(document.querySelectorAll('div[role="option"]'))
                .find((v) => v.innerText.match("Other"))
                .click();
        });
        await timeout(1000);
        await this.type({
            selector: 'input[type="text"][aria-label="Enter custom name"]',
            value: "imap",
            stealth: true,
        });
        await timeout(1000);
        await this.click({
            selector: 'c-wiz > div > div:nth-child(3) > div > div > div:nth-child(3) > div:nth-child(3) div[role="button"]',
        });
        await timeout(5000);
        const text = await page.evaluate(async () => (document.querySelector("div[autofocus] span") || {})
            .innerText || "");
        this.logger.info("app password: " + text);
        this.appPassword = text;
        return text;
    }
    async selectUS() {
        await this._page.evaluate(async () => {
            document.querySelector("div#countryList > div > div").click();
            await new Promise((resolve) => setTimeout(resolve, 50));
            const last = (ary) => ary[ary.length - 1];
            last([].slice
                .call(document.querySelectorAll("div#countryList li"))
                .filter((v) => v.innerText.match(/\(\+1\)/))).click();
        });
    }
    async createAccount({ username, smspinverify, save, enable2fa, appPassword, recovery, name, password, proxyServer, city, }) {
        const fetchOTP = smspinverify
            ? this.getOTPFromSmsPinVerify.bind(this)
            : this.getOTP.bind(this);
        name = name || faker_1.faker.name.fullName();
        username = username || faker_1.faker.internet.userName(...name.split(/\s+/));
        password = password || (0, generate_password_1.generate)({ numbers: true, length: 16 });
        this.username = username;
        this.email = this.username + "@gmail.com";
        this.password = password;
        this.recoveryEmail = recovery;
        this.name = name;
        let page = this._page;
        await page.goto("https://accounts.google.com");
        this.logger.info("load https://accounts.google.com");
        await this.waitForSelector({ selector: "button" });
        await page.evaluate(async () => {
            document.querySelectorAll("button")[3].click();
            await new Promise((resolve) => setTimeout(resolve, 50));
            [].slice
                .call(document.querySelectorAll("li"))
                .find((v) => v.innerText.match("personal"))
                .click();
        });
        this.logger.info("load new account form");
        await timeout(5000);
        const [firstName, lastName] = name.split(" ");
        await this.type({
            selector: "input#firstName",
            value: firstName,
            stealth: true,
        });
        await this.type({
            selector: "input#lastName",
            value: lastName,
            stealth: true,
        });
        const isAlternativeView = !(await page.evaluate(() => document.querySelector("#username")));
        if (isAlternativeView) {
            await this.click({ selector: "button" });
            await this.waitForSelector({ selector: "select#month" });
            await this.timeout({ n: 400 + Math.floor(Math.random() * 500) });
            await this.select({ selector: "select#month", value: "1" });
            await this.timeout({ n: 400 + Math.floor(Math.random() * 500) });
            await this.type({ selector: "input#day", value: "1", stealth: true });
            await this.type({ selector: "input#year", value: "1985", stealth: true });
            await this.timeout({ n: 400 + Math.floor(Math.random() * 500) });
            await this.select({ selector: "select#gender", value: "1" });
            await this.timeout({ n: 400 + Math.floor(Math.random() * 500) });
            await this.click({ selector: "button" });
            await this.timeout({ n: 400 + Math.floor(Math.random() * 500) });
            await this.waitForSelector({ selector: "button" });
            if (await this.waitForSelectorFromList({ selectors: ['div#selectionc2', 'input[name="Username"]'] }) === 'div#selectionc2') {
                await this.click({ selector: "div#selectionc2" });
                await this.timeout({ n: 400 + Math.floor(Math.random() * 500) });
            }
            await this.type({
                selector: 'input[name="Username"]',
                value: username,
                stealth: true,
            });
            await this.timeout({ n: 400 + Math.floor(Math.random() * 500) });
            await this.click({ selector: "button" });
            await this.waitForSelector({ selector: 'input[name="Passwd"]' });
            await this.timeout({ n: 400 + Math.floor(Math.random() * 500) });
            await this.type({
                selector: 'input[name="Passwd"]',
                value: password,
                stealth: true,
            });
            await this.timeout({ n: 400 + Math.floor(Math.random() * 500) });
            await this.type({
                selector: 'input[name="PasswdAgain"]',
                value: password,
                stealth: true,
            });
            await this.timeout({ n: 400 + Math.floor(Math.random() * 500) });
            await this.click({ selector: "button" });
        }
        else {
            await this.type({
                selector: "#username",
                value: username,
                stealth: true,
            });
            await this.type({
                selector: "div#passwd input",
                value: password,
                stealth: true,
            });
            await this.type({
                selector: "div#confirm-passwd input",
                value: password,
                stealth: true,
            });
            await this.click({ selector: "div#accountDetailsNext button" });
        }
        this.logger.info("filled account form");
        this.logger.info({ name, username });
        await timeout(5000);
        const isVerify = await page.evaluate(() => {
            return Boolean(document.querySelector("input#phoneNumberId"));
        });
        if (isVerify) {
            await this.selectUS();
            const otp = await fetchOTP(async (number) => {
                await this.type({
                    selector: "input#phoneNumberId",
                    value: number,
                    stealth: true,
                });
                await this.click({ selector: "button" });
            }, async () => {
                await this.click({
                    selector: 'div[data-primary-action-label="Verify"] > div > div:nth-child(2) button',
                });
            });
            this.logger.info("got OTP!");
            await this.type({ selector: "input#code", value: otp, stealth: true });
            await this.click({ selector: "button" });
        }
        else {
            const usernamenotGood = await page.evaluate(() => {
                const inputField = document.querySelector(".o6cuMc");
                let shadowColor;
                inputField
                    ? (shadowColor = window.getComputedStyle(inputField).color)
                    : (shadowColor = "&");
                return Boolean(shadowColor === "rgb(217, 48, 37)");
                //console.log("Input field shadow color changed to red!");
            });
            if (usernamenotGood) {
                const textElement = await page.$eval(".o6cuMc", (el) => el.innerText);
                this.logger.error(textElement);
                return { success: false };
            }
        }
        await timeout(5000);
        this.logger.info("waiting ...");
        recovery = recovery || faker_1.faker.internet.userName().toLowerCase() + String(Math.floor(Math.random() * 100)) + "@outllok.com";
        const onlyRecoveryField = (await this.waitForSelectorFromList({
            selectors: ['input[name="recoveryEmail"]', 'input[name="recovery"]'],
        })) === 'input[name="recovery"]';
        if (onlyRecoveryField) {
            await this.type({
                selector: 'input[name="recovery"]',
                value: recovery,
                stealth: true,
            });
            await this.timeout({ n: 400 + Math.floor(Math.random() * 1000) });
            await this.click({ selector: "button" });
            await this.timeout({ n: 400 + Math.floor(Math.random() * 1000) });
            await this.click({
                selector: 'div[data-is-consent="false"] > div > div > div:nth-child(2) button',
            });
            await this.timeout({ n: 400 + Math.floor(Math.random() * 1000) });
            await this.click({ selector: "button" });
            this.logger.info("filled out recovery form");
            this.logger.info({ recovery });
        }
        else {
            await this.type({
                selector: 'input[name="recoveryEmail"]',
                value: recovery,
                stealth: true,
            });
            await page.evaluate((recovery) => {
                const [phone] = document.querySelectorAll("input");
                phone.value = "";
            });
            await this.select({ selector: "select#month", value: "1" });
            await this.type({ selector: "input#day", value: "1", stealth: true });
            await this.type({ selector: "input#year", value: "1985", stealth: true });
            await this.select({ selector: "select#gender", value: "1" });
            this.logger.info("filled out recovery form");
            this.logger.info({ recovery });
            await this.click({ selector: "button" });
        }
        await timeout(5000);
        this.logger.info("privacy settings");
        await this.click({ selector: "button" });
        await timeout(500);
        await page.evaluate(async () => {
            const els = document.querySelectorAll('span div:nth-child(2) div:nth-child(1) div:nth-child(1) div[role="radio"]');
            if ([].slice.call(els).length < 6)
                return;
            const timeout = async (n) => await new Promise((resolve) => setTimeout(resolve, n));
            const convincingTimeout = async () => await timeout(250 + Math.floor(500 * Math.random()));
            const click = async (el) => {
                await convincingTimeout();
                el.scrollIntoView();
                await convincingTimeout();
                el.click();
                await convincingTimeout();
            };
            await click(els[1]);
            await click(els[3]);
            await click(els[5]);
            const buttons = document.querySelectorAll("button");
            await click(buttons[3]);
        });
        await timeout(5000);
        if (enable2fa) {
            await this.enable2fa({ smspinverify });
        }
        if (appPassword) {
            await this.enableAppPassword();
        }
        if (save)
            await this.saveToBitwarden();
        if (city) {
            await this.verifyVoice({ city });
        }
        return { success: true };
    }
    async goToVoiceMessages() {
        const page = this._page;
        await page.goto("https://voice.google.com/u/0/signup");
        await page.waitForSelector("a.mat-list-item");
        await page.evaluate(() => document.querySelectorAll("a.mat-list-item")[6].click());
    }
    async dumpVoice() {
        const page = this._page;
        await page.goto("https://voice.google.com/u/0/signup");
        await timeout(2500);
        const phoneNumber = (await page.evaluate(() => document.querySelectorAll("div.phone-number-details span")[1]
            .innerText)).replace(/[\s\-\(\)]/g, "");
        await page.evaluate(() => document.querySelectorAll("a.mat-list-item")[6].click());
        await timeout(2000);
        const threads = await page.evaluate(async (phoneNumber) => {
            const threadElements = [].slice.call(document.querySelectorAll("div[gv-thread-id]"));
            const result = [];
            for (const thread of threadElements) {
                thread.click();
                await new Promise((resolve) => setTimeout(resolve, 3000));
                const threadId = thread.getAttribute("gv-thread-id");
                result.push({
                    thread: threadId,
                    messages: [].slice
                        .call(document.querySelectorAll("gv-text-message-item"))
                        .map((v) => {
                        const from = [].slice
                            .call(v.children[0].classList)
                            .includes("incoming")
                            ? threadId
                            : "t.+1" + phoneNumber;
                        const timestamp = Number(new Date(v.children[0].children[0].children[1].innerText
                            .split(/\s+/)
                            .slice(-6)
                            .join(" ")));
                        return {
                            timestamp,
                            from,
                            message: v.children[0].children[0].children[2].innerText,
                        };
                    }),
                });
            }
            return result;
        }, phoneNumber);
        return {
            phoneNumber,
            threads,
        };
    }
    async login({ email, password, recoveryEmail, totpSecret, smspinverify }) {
        const fetchOTP = smspinverify
            ? this.getOTPFromSmsPinVerify.bind(this)
            : this.getOTP.bind(this);
        // store email password to be serialized when flow is complete
        this.email = email = email || this.email;
        this.username = this.email.split("@")[0];
        this.password = password = password || this.password;
        this.recoveryEmail = recoveryEmail = recoveryEmail || this.recoveryEmail;
        this.totpSecret = totpSecret = totpSecret || this.totpSecret;
        let page = this._page;
        await page.goto("https://accounts.google.com");
        this.logger.info("load https://accounts.google.com");
        await page.waitForSelector("input#identifierId");
        await page.type("input#identifierId", email);
        await page.click("div#identifierNext button");
        await page.waitForSelector("div#passwordNext button");
        await timeout(500);
        await page.type('input[type="password"]', password);
        await page.click("div#passwordNext button");
        this.logger.info("logging in...");
        await timeout(5000);
        if (await page.evaluate(() => Boolean(document.querySelector("input#totpPin")))) {
            if (totpSecret) {
                await page.evaluate(() => {
                    const els = [].slice
                        .call(document.querySelectorAll("li div[data-challengeindex]"))
                        .filter((v) => v.innerText.match("Google Authenticator"));
                    if (els.length) {
                        const matchLength = Math.min(...els.map((v) => v.innerText.length));
                        const el = els.find((v) => v.innerText.length === matchLength);
                        el.click();
                    }
                });
                await page.waitForSelector("input#totpPin");
                await timeout(400);
                let totp = (0, totp_generator_2.default)(totpSecret.replace(/\s+/g, ""));
                await page.type("input#totpPin", totp);
                await timeout(450);
                await page.evaluate(async () => {
                    await new Promise((resolve) => setTimeout(resolve, 50));
                    document.querySelectorAll("button")[0].click();
                    await new Promise((resolve) => setTimeout(resolve, 50));
                });
            }
        }
        await timeout(2000);
        const isVerifyOTP = await page.evaluate(() => {
            return Boolean(document.querySelector('input[type="tel"]#deviceAddress'));
        });
        if (isVerifyOTP) {
            await this.selectUS();
            const otp = await fetchOTP(async (number) => {
                await page.type('input[type="tel"]#deviceAddress', number);
                await page.click('input[type="submit"]');
            }, async () => {
                throw Error("OTP never arrived");
            });
            this.logger.info("got OTP!");
            await page.type("input#smsUserPin", otp);
            await timeout(50);
            await page.click('input[type="submit"]');
            await timeout(2000);
        }
        // try another way
        /*
        await page.evaluate(async () => {
          document.querySelectorAll("button")[1].click();
          await new Promise((resolve) => setTimeout(resolve, 50));
        });
        
        // get a verification code at ...
        await page.evaluate(async () => {
          document.querySelectorAll("li")[1].click();
          await new Promise((resolve) => setTimeout(resolve, 50));
        });
       */
        const isLoggedIn = await page.evaluate(() => {
            return Boolean(document.querySelector('c-wiz[data-help-context="HOME_SCREEN"]'));
        });
        if (isLoggedIn)
            return { success: true };
        return { success: true };
    }
}
exports.GoogleAccountClient = GoogleAccountClient;
//# sourceMappingURL=google-account.js.map