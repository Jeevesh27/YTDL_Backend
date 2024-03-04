const express = require("express");
const http = require("http");
const ytdl = require("ytdl-core");
const ffmpegStatic = require("ffmpeg-static");
const cp = require("child_process");
const ffmpeg = require("fluent-ffmpeg");
const cors = require("cors");
const bodyParser = require("body-parser");

ffmpeg.setFfmpegPath(ffmpegStatic);

const app = express();
const server = http.createServer(app);
const io = require('socket.io')(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const CorsOption = {
    origin: '*',
    credentials: true
};

app.use(cors(CorsOption));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.json());

app.get('/checksetup', async (req, res) => {
    res.send("Ready")
})

app.post('/', async (req, res) => {
    try {
        const { ContentLength, URL, Duration, User_ID } = req.body;
        res.setHeader('Content-Type', 'video/mp4');
        let videoduration = 0;

        const isValid = ytdl.validateURL(URL)
        if (!isValid) {
            res.status(500).send("ERROR")
            res.end()
        } else {
            const Video = ytdl(URL, {
                filter: (format) => {
                    if (format.contentLength === ContentLength) {
                        videoduration = Math.max(videoduration, format.contentLength / 1024 / 1024);
                    }
                    return format.contentLength === ContentLength;
                },
            });

            const Audio = ytdl(URL, {
                filter: (format) => {
                    return format.audioQuality === "AUDIO_QUALITY_MEDIUM";
                },
            });


            const ffmpegProcess = cp.spawn(
                ffmpegStatic,
                [
                    '-loglevel', '8',
                    '-hide_banner',
                    '-i', 'pipe:3',
                    '-i', 'pipe:4',
                    '-t', Duration,
                    '-map', '0:a',
                    '-map', '1:v',
                    '-c:v', 'copy',
                    '-c:a', 'copy',
                    '-preset', 'ultrafast',
                    '-f', 'matroska',
                    'pipe:5',
                ],
                {
                    windowsHide: true,
                    stdio: ["inherit", "inherit", "inherit", "pipe", "pipe", "pipe"],
                }
            );

            Video.pipe(ffmpegProcess.stdio[4]);
            Audio.pipe(ffmpegProcess.stdio[3]);

            ffmpegProcess.stdio[5].pipe(res)

            let currentDuration = 0

            ffmpegProcess.stdio[5].on("data", (data) => {
                currentDuration += data.length
                if (data) {
                    io.emit('data sent', {
                        size: Math.floor((currentDuration / (1024 * 1024))), duration: Math.floor(videoduration)
                    });
                }
            })
            ffmpegProcess.stdio[5].on("download start", () => {
                io.emit("end")
            })
        }
    } catch (error) {
        console.error(error);
        res.status(500).send("An error occurred");
    }
})


const port = 4000

server.listen(port, () => {
    console.log(`Backend listening on port ${port}`);
});

process.on('uncaughtException', function (err) {
    console.error(err);
    console.log("Node NOT Exiting...");
    // res.send("ERROR")
});

process.on('unhandledRejection', (reason, promise) => {
    console.log('Unhandled Rejection at:', promise, 'reason:', reason);
});
