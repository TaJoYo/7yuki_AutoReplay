// index.js
try { require('dotenv').config(); } catch (_) { }
const puppeteer = require('puppeteer');
const axios = require('axios');
const { text } = require('stream/consumers');

const AK = process.env.BAIDU_AK;
const SK = process.env.BAIDU_SK;
const HEADFUL = String(process.env.HEADFUL).toLowerCase() === 'true';
const THREAD_URLS = [
    "https://7yuki.com/thread-7434-1-1.html",
    "https://7yuki.com/thread-623-1-1.html",
    "https://7yuki.com/thread-597-1-1.html"
];

/**
 * 解析多个账户信息
 */
function parseAccounts() {
    const accounts = [];
    
    // 支持两种方式定义多账户：
    // 1. 通过环境变量 ACCOUNTS_JSON 定义（JSON 格式）
    // 2. 通过多个 *_USERNAME/*_PASSWORD 对定义
    
    if (process.env.ACCOUNTS_JSON) {
        try {
            return JSON.parse(process.env.ACCOUNTS_JSON);
        } catch (e) {
            console.error('ACCOUNTS_JSON 解析失败:', e.message);
        }
    }
    
    // 如果没有提供 ACCOUNTS_JSON，则查找形如 USER1_USERNAME/USER1_PASSWORD 的环境变量对
    const envKeys = Object.keys(process.env);
    const userPrefixes = [...new Set(envKeys
        .filter(key => key.endsWith('_USERNAME'))
        .map(key => key.replace('_USERNAME', '')))];
    
    for (const prefix of userPrefixes) {
        const username = process.env[`${prefix}_USERNAME`];
        const password = process.env[`${prefix}_PASSWORD`];
        
        if (username && password) {
            accounts.push({ username, password });
        }
    }
    
    // 如果没有找到前缀形式的账户，则使用默认的 YUKI_USERNAME/YUKI_PASSWORD
    if (accounts.length === 0 && process.env.YUKI_USERNAME && process.env.YUKI_PASSWORD) {
        accounts.push({
            username: process.env.YUKI_USERNAME,
            password: process.env.YUKI_PASSWORD
        });
    }
    
    return accounts;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
function jitter(ms, spread = 3000) {
    const d = Math.floor(Math.random() * spread);
    return ms + d;
}

function getAccessToken() {
    let options = {
        'method': 'POST',
        'url': 'https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=' + AK + '&client_secret=' + SK,
    }
    return new Promise((resolve, reject) => {
        axios(options)
            .then(res => {
                resolve(res.data.access_token)
            })
            .catch(error => {
                reject(error)
            })
    })
}

async function recognizeCaptchaBaidu(imgData, isBase64 = false) {
    const token = await getAccessToken();
    const base64Img = isBase64 ? imgData : Buffer.from(imgData).toString('base64');

    try {
        const response = await axios.post(
            `https://aip.baidubce.com/rest/2.0/ocr/v1/general_basic?access_token=${token}`,
            `image=${encodeURIComponent(base64Img)}`,
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );

        if (response.data.error_code) throw new Error(response.data.error_msg);

        const code = response.data.words_result?.[0]?.words?.trim().replace(/\s+/g, '') || null;
        return code;
    } catch (err) {
        console.error('OCR 识别出错:', err.message);
        return null;
    }
}

// async function loginWithCookie(page) {
//     if (!COOKIE) return false;
//     const pairs = COOKIE.split(';').map(s => s.trim()).filter(Boolean);
//     const cookies = pairs.map(p => {
//         const eq = p.indexOf('=');
//         const name = eq >= 0 ? p.slice(0, eq) : p;
//         const value = eq >= 0 ? p.slice(eq + 1) : '';
//         return { name, value, domain: '7yuki.com', path: '/' };
//     });
//     await page.setCookie(...cookies);

//     await page.goto('https://7yuki.com/', { waitUntil: 'networkidle2' });
//     await sleep(2000);
//     const logged = await page.$('#myitem') || await page.$('#myprompt');
//     if (logged) {
//         console.log('使用 Cookie 登录成功');
//         return true;
//     } else {
//         console.log('Cookie 可能失效，尝试账号密码登录');
//         return false;
//     }
//}

async function loginWithPassword(page, username, password) {
    if (!username || !password) return false;
    await page.goto('https://7yuki.com/member.php?mod=logging&action=login', { waitUntil: 'networkidle2' });
    await page.waitForSelector('[name="username"]', { timeout: 15000 });
    await page.type('[name="username"]:not(#lostpw_username)', username, { delay: 20 });
    await page.type('[name="password"]', password, { delay: 20 });
    await page.click('[name="cookietime"]', { delay: 20 });
    await Promise.all([
        page.click('button[name="loginsubmit"]'),
        page.waitForNavigation({ waitUntil: 'networkidle2' })
    ]);
    const logged = await page.$('#myitem') || await page.$('#myprompt');
    if (logged) {
        console.log(`使用账号 ${username} 登录成功`);
        return true;
    }
    console.log(`账号 ${username} 登录失败`);
    return false;
}

async function clickEntry(page) {
    await page.waitForSelector('.byg_sd_t.cl .reply_img', { timeout: 20000 });
    await page.click('.byg_sd_t.cl .reply_img');
}

async function fillPost(page) {
    await page.waitForSelector('textarea#postmessage', { timeout: 20000 });
    await page.$eval('textarea#postmessage', el => {
        el.value = '';
        el.value = "感谢分享，感谢分享。感谢分享，感谢分享";
    });
}

async function waitForCaptchaImage(page) {
    // 点击输入框，触发验证码显示
    await page.evaluate(() => {
        const el = document.querySelector('[name="seccodeverify"]');
        if (el) el.click();
    });

    await sleep(3000);

    // 等待验证码图片出现并且加载完成
    await page.waitForFunction(() => {
        const img = document.querySelector('.p_pop.p_opt img.vm');
        return img && img.complete && img.naturalWidth > 0;
    }, { timeout: 10000 });

    return await page.$('.p_pop.p_opt img.vm');
}

async function trySolveCaptcha(page) {
    for (let i = 0; i < 5; i++) {
        try {
            const imgHandle = await waitForCaptchaImage(page);
            if (!imgHandle) {
                console.log('验证码图片没找到');
                await sleep(1000);
                continue;
            }

            const buffer = await imgHandle.screenshot({ encoding: 'binary' });
            const base64Img = Buffer.from(buffer).toString('base64');

            const code = await recognizeCaptchaBaidu(base64Img, true);
            if (code && code.length === 4) {
                console.log('验证码识别成功:', code);
                return code;
            }

            console.log('验证码识别失败，刷新重试');

            // 刷新验证码：强制点击图片触发更新
            await page.evaluate(() => {
                const el = document.querySelector('.p_pop.p_opt img.vm');
                if (el) el.click();
            });

            await sleep(2000);
        } catch (err) {
            console.error('验证码处理异常:', err.message);
            await sleep(2000);
        }
    }
    return null;
}


async function postOnce(page) {
    await clickEntry(page);
    await page.waitForSelector('[name="seccodeverify"]', { timeout: 20000 });
    await fillPost(page);


        const code = await trySolveCaptcha(page);
        if (!code) {
            console.log('验证码识别失败，本次放弃');
            return false;
        }

        await page.$eval('[name="seccodeverify"]', el => el.value = ''); // 清空旧值
        await page.type('[name="seccodeverify"]', code);
        await sleep(jitter(2000, 500));

        await page.evaluate(() => {
            const el = document.querySelector('button#postsubmit');
            if (el) el.click();
        });
        await sleep(10000);

        const replyWin = await page.$('#fwin_reply');
        if (replyWin) {
            console.log('提交失败');
            // 关闭弹窗，继续下一次尝试
            await page.evaluate(() => {
                document.querySelector('#fwin_reply .flbc')?.click();
            });
            await sleep(2000);
            return false
        }
        return true;
}


/**
 * 处理单个账户的任务
 */
async function handleAccount(account) {
    console.log(`开始处理账户: ${account.username}`);
    
    const browser = await puppeteer.launch({
        headless: HEADFUL ? false : 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--window-size=1280,800',
            '--user-data-dir=./puppeteer_profile' + account.username,
        ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36 Edg/139.0.0.0');

    let logged = await loginWithPassword(page, account.username, account.password);
    if (!logged) {
        console.log(`账户 ${account.username} 登录失败，退出`);
        await browser.close();
        return false;
    }

    let success = 0;
    for (let i = 0; i < 20; i++) {
        try {
            const randomIndex = Math.floor(Math.random() * THREAD_URLS.length);
            const threadUrl = THREAD_URLS[randomIndex];

            await page.goto(threadUrl, { waitUntil: 'networkidle2' });
            const ok = await postOnce(page);

            if (ok) {
                success++;
                console.log(`账户 ${account.username} 第 ${success} 次回复成功`);
                if (success >= 5){
                    console.log(`账户 ${account.username} 今日回复已完成`);
                    break;
                }
                await sleep(jitter(60_000, 8000));
            } else {
                console.log(`账户 ${account.username} 本次失败，5 秒后重试`);
                await sleep(5000);
            }
        } catch (e) {
            console.log(`账户 ${account.username} 异常：`, e.message);
            await sleep(5000);
        }
    }

    // 获取积分信息
    try {
        await page.goto('https://7yuki.com/', { waitUntil: 'networkidle2' });
        await page.waitForSelector('.myitem_one', { timeout: 10000 });
        const points = await page.$eval('.myitem_one', el => el.innerText);
        console.log(`账户 ${account.username} ${points}`);
    } catch (e) {
        console.log(`账户 ${account.username} 获取积分信息失败:`, e.message);
    }

    await browser.close();
    return true;
}

(async () => {
    const accounts = parseAccounts();
    
    if (accounts.length === 0) {
        console.log('未找到任何账户信息，请检查环境变量配置');
        process.exit(1);
    }
    
    console.log(`共找到 ${accounts.length} 个账户`);
    
    // 依次处理每个账户
    for (const [index, account] of accounts.entries()) {
        try {
            console.log(`开始处理第 ${index + 1} 个账户`);
            await handleAccount(account);
            
            // 账户之间添加间隔，避免过于频繁
            if (index < accounts.length - 1) {
                console.log('等待 30 秒后处理下一个账户');
                await sleep(30000);
            }
        } catch (e) {
            console.error(`处理账户 ${account.username} 时发生错误:`, e.message);
        }
    }
    
    console.log('所有账户处理完毕');
})();




