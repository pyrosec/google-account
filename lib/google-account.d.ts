import { BasePuppeteer } from "base-puppeteer";
export declare class GoogleAccountClient extends BasePuppeteer {
    textVerifiedToken: string;
    email: string;
    username: string;
    name: string;
    password: string;
    recoveryEmail: string;
    totpSecret: string;
    cookies: any[];
    saveToBitwarden(): Promise<{
        success: boolean;
    }>;
    getOTP(fn: any, goBack: any): Promise<any>;
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
    enable2fa(): Promise<void>;
    getTotpSecret(): Promise<any>;
    createAccount({ username, save, enable2fa, recovery, name, password, proxyServer }: {
        username: any;
        save: any;
        enable2fa: any;
        recovery: any;
        name: any;
        password: any;
        proxyServer: any;
    }): Promise<{
        Done: string;
        success?: undefined;
    } | {
        success: boolean;
        Done?: undefined;
    }>;
    goToVoiceMessages(): Promise<void>;
    dumpVoice(): Promise<{
        phoneNumber: any;
        threads: any;
    }>;
    login({ email, password, recoveryEmail, totpSecret }: {
        email: any;
        password: any;
        recoveryEmail: any;
        totpSecret: any;
    }): Promise<{
        success: boolean;
    }>;
}
