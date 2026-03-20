import * as fs from 'fs';

export const watchPortFile = async (filePath: string): Promise<number> => {
    let backOff = 300;
    const maxBackOff = 5000;

    while (true) {
        try {
            const port = await readPortFile(filePath);
            if (port) return port;

            await new Promise((r) => setTimeout(r, backOff));
            backOff = Math.min(backOff * 2, maxBackOff);
        } catch {
            await new Promise((r) => setTimeout(r, backOff));
            backOff = Math.min(backOff * 2, maxBackOff);
        }
    }
};

export async function readPortFile(filePath: string): Promise<number> {
    const content = await readFileAsync(filePath);
    const port = parseInt(content.trim(), 10);
    if (Number.isNaN(port)) {
        throw new Error("Invalid port in memento-daemon.port");
    }
    return port;
}

function readFileAsync(path: string): Promise<string> {
    return new Promise((resolve, reject) => {
        fs.readFile(path, "utf-8", (err, data) => {
            if (err) return reject(err);
            resolve(data);
        });
    });
}



