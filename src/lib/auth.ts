import type {ClientPlugin, ViteBlitzCtx, ViteServerBlitzPlugin} from "."
import type { PrismaClient, Session, Prisma } from "@prisma/client"
import {nanoid} from "nanoid"
import type { Cookies } from "@sveltejs/kit"
export class PrismaClientSingleTon {
    static instance: PrismaClient
    private db: PrismaClient
    constructor() {
        this.db = PrismaClientSingleTon.instance
    }
    static getDb(): PrismaClient & PrismaClientSingleTon {
        return new Proxy(new PrismaClientSingleTon(), {
            get(target, prop, reciever) {
                if(prop in target.db) return Reflect.get(target.db, prop, reciever)
                return Reflect.get(target, prop, reciever)
            },
            set(target, prop, value, reciever) {
                if(prop in target.db) return Reflect.set(target.db, prop, value, reciever)
                return Reflect.set(target, prop, value, reciever)
            }
        }) as any
    }
}


export const getDb = PrismaClientSingleTon.getDb

export type Context = {
    $token: string | null
    $publicData: unknown
    // $authorize(...args: unknown[]): boolean
    // $isAuthorized cannot have assertion return type because it breaks advanced use cases
    // with multiple isAuthorized calls
    // $isAuthorized: (...args: unknown[]) => boolean
    // $thisIsAuthorized: (...args: unknown[]) => boolean
    $loginSession: (userId: number) => Promise<void>
    $revoke: () => Promise<void>
    $getPrivateData: () => Promise<Record<any, any>>
    $setPrivateData: (data: Record<any, any>) => Promise<void>
    $setPublicData: (data: Record<any, any>) => Promise<void>
} 

class ContextClass implements ViteBlitzCtx {
    userId?: number
    cookies: Cookies
    headers: Headers
    constructor(public $token: string, private db: PrismaClient, private session: Session, ctx: ViteBlitzCtx) {
        this.cookies = ctx.cookies
        this.headers = ctx.headers
    }
    get $publicData() {
        return this.session.publicData
    }
    async $setPublicData (data: Record<any, any>) {
        const current = await this.db.session.findFirst({
            where: {
                token: this.$token
            }
        })

        if(current?.updatedAt  ?? new Date(0) > this.session.updatedAt) this.session = current ?? this.session
        await this.db.session.update({
            where: {
                token: this.$token
            },
            data: {
                publicData: {...(this.session.publicData as object), ...data}
            }
        })
        this.session.publicData = {...(this.session.publicData as object), ...data}
    };

    $isLoggedIn(): this is {userId: number} & this {
        return this.userId != null
    }
    async $getPrivateData(){
        if(!this.$isLoggedIn()) throw new Error("Must be logged in to do this")
        return (await this.db.session.findFirst({where: {
            token: this.$token
        }}))!
    };
    async $setPrivateData(data: any) {
        if(!this.$isLoggedIn()) throw new Error("Must be logged in to do this")
        await this.db.session.update({
            where: {
                token: this.$token
            },
            data: {
                privateData: data
            }
        })
    }
    async $signupSession(userId: number) {
        await this.db.session.update({
            where: {
                token: this.$token
            },
            data: {
                userId: userId
            }
        })
        this.userId = userId;
    }
    async $loginSession(userId: number) {
        const session = await this.db.session.findFirst({where: {userId}})
        if(session == null) throw new Error("No session by that id")
        await this.db.session.delete({where: {token: this.$token}})
        const {csrfSecret, token} = session
        const {tokens} = await import("./auth-token")
        this.cookies.set("csrf-token", tokens.create(csrfSecret))
        this.cookies.set("token", token)
        this.$token = token
    };
    async $revoke() {
        await this.db.session.update({
            where: {
                token: this.$token
            },
            data: {
                userId: null
            }
        })
        this.userId = undefined;
        this.session.userId = null;
    }
}



const generateToken = (size: number = 32) => nanoid(size)

const checkCsrfToken = async (secret: string, csrfToken?: string | null | undefined) => csrfToken != null ? (await import("./auth-token")).tokens.verify(secret, csrfToken) : true

const createSession = async (db: PrismaClient) => {
    const sessionToken = generateToken()
    const {tokens} = await import("./auth-token")
    const csrfSecret = tokens.secretSync()
    const session = await db.session.create({data: {token: sessionToken, csrfSecret} as any})
    return session
}

const getSession = async (token: string | undefined, db: PrismaClient) => {
    if(token == null) return (await createSession(db))
    const session = await db.session.findFirst({where: {token} as any})
    if(session == null) throw new Error("Token mismatch")
    return session
}

const getSessionAndVerify = async (token: string | undefined, csrfToken: string | undefined, db: PrismaClient) => {
    if(token == null && csrfToken != null) throw new Error("CSRF mismatch")
    const session = await getSession(token, db)
    const {tokens} = await import("./auth-token")
    if(token == null) return {session, csrfToken: tokens.create(session.csrfSecret)}
    return {session, csrfToken}
}

export const getContext = async (token: string | undefined, csrfTokenPrev: string | undefined, ctx: {cookies: Cookies, headers: Headers}, db: PrismaClient) => {
    const {session, csrfToken} = await getSessionAndVerify(token, csrfTokenPrev, db)
    return new ContextClass(session.token, db, session, ctx as ViteBlitzCtx)
}

export const verifyAndGetSession = async (token: string, csrfToken: string, db: PrismaClient) => {
    const session = await getSession(token, db)
    if(!(await checkCsrfToken(session.csrfSecret!, csrfToken))) throw new Error("Csrf token mismatch")
    return session
}

export const authPlugin = ({db}: {db: PrismaClient}): ViteServerBlitzPlugin => {
    PrismaClientSingleTon.instance = db
    return {
        async load(request, cookies, ctx) {
            const session = await getSession(cookies.get("token"), db)
            const {csrfSecret} = session
            if(!(await checkCsrfToken(csrfSecret, request.headers.get("csrf-token")))) throw new Error("Csrf token mismatch")
            const csrfToken = request.headers.get("csrf-token") == null && cookies.get("token") == null ? (await import("./auth-token")).tokens.create(csrfSecret) : request.headers.get("csrf-token")
            if(csrfToken == null) throw new Error("No csrf token found")
            if(cookies.get("token") == null) {
                ctx.cookies.set("csrf-token", csrfToken)
                ctx.cookies.set("token", session.token)
            }

            return {}
        }
    }
}

export const authClientPlugin: ClientPlugin<{["csrf-token"]: string}> = ({["csrf-token"]: csrfToken}) => async (): Promise<{headers: {"csrf-token"?: string}}> => {
    if(import.meta.env.SSR) return {headers: {}}
    const {default: Cookies} = await import("js-cookie")
    return {
        headers: {
            "csrf-token": csrfToken,
        }
    }
}