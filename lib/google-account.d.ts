import { BasePuppeteer } from "base-puppeteer";
export declare class GoogleAccountClient extends BasePuppeteer {
    textVerifiedToken: string;
    email: string;
    username: string;
    name: string;
    password: string;
    appPassword: string;
    recoveryEmail: string;
    totpSecret: string;
    cookies: any[];
    saveToBitwarden(): Promise<{
        success: boolean;
    }>;
    getOTP(fn: any, goBack: any): Promise<any>;
    getOTPFromSmsPinVerify(fn: any, goBack: any, app?: string, ticks?: number): Promise<any>;
    goToForwarding(): Promise<void>;
    forwardEmail({ to }: {
        to: any;
    }): Promise<{
        success: boolean;
    }>;
    enterForwardingConfirmationCode({ code, action }: {
        code: any;
        action: any;
    }): Promise<{
        success: boolean;
    }>;
    toMuttrc({ username, password, name }: {
        username: any;
        password: any;
        name: any;
    }): Promise<void>;
    needsPassword(): Promise<boolean>;
    enterPassword(): Promise<void>;
    changePassword({ newPassword }: {
        newPassword: any;
    }): Promise<{
        success: boolean;
    }>;
    sendVoice({ to, message }: {
        to: any;
        message: any;
    }): Promise<{
        success: boolean;
    }>;
    verifyVoice({ city }: {
        city: any;
    }): Promise<void>;
    enable2fa({ smspinverify }: {
        smspinverify: any;
    }): Promise<void>;
    getTotpSecret(): Promise<any>;
    enableAppPassword(): Promise<any>;
    selectUS(): Promise<void>;
    createAccount({ username, smspinverify, save, enable2fa, appPassword, recovery, name, password, proxyServer, city, }: {
        username: any;
        smspinverify: any;
        save: any;
        enable2fa: any;
        appPassword: any;
        recovery: any;
        name: any;
        password: any;
        proxyServer: any;
        city: any;
    }): Promise<{
        success: boolean;
    }>;
    goToVoiceMessages(): Promise<void>;
    dumpVoice(): Promise<{
        phoneNumber: any;
        threads: any;
    }>;
    login({ email, password, recoveryEmail, totpSecret, smspinverify }: {
        email: any;
        password: any;
        recoveryEmail: any;
        totpSecret: any;
        smspinverify: any;
    }): Promise<{
        success: boolean;
    }>;
}
