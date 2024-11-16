const authToken = "your-auth-token"; // Replace with your actual auth token
const query = new URLSearchParams(window.location.search);
async function getMe() {
    const myData = await fetch("https://api.temanternak.h14.my.id/users/my", {
        headers: {
            Authorization: `Bearer ${query.get("token") || authToken}`,
        },
    });
    return (await myData.json()).data;
}
async function getConsultation() {
    const consultation = await fetch(
        `https://api.temanternak.h14.my.id/bookings/${query.get(
            "id"
        )}/consultations`,
        {
            headers: {
                Authorization: `Bearer ${query.get("token") || authToken}`,
                accept: "application/json",
            },
        }
    );
    return (await consultation.json()).data;
}
const peers = new Map();
let localStream;
let roomId;
let localIsMuted = false;
let localIsVideoOn = true;
let socket;
let myData;
let consultation;
const configuration = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        {
            urls: "turn:sip.temanternak.h14.my.id:3478",
            username: "temanternak",
            credential: "123123",
        },
    ],
};

async function joinRoom() {
    console.log("Join Room");

    console.log("consultation", consultation);
    try {
        socket = io("https://vcall.temanternak.h14.my.id/", {
            extraHeaders: {
                authorization: `bearer ${consultation.token}`,
            },
        });
        // Join room
        socket.on("user-connected", async (socketId, userId) => {
            console.log("User connected:", userId);
            const peerConnection = createPeerConnection(socketId, userId);
            // Create and send offer
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            socket.emit(
                "offer",
                offer,
                roomId,
                socketId,
                localIsMuted,
                localIsVideoOn
            );
        });
        socket.on(
            "offer",
            async (offer, socketId, userId, isMuted, isVideoOn) => {
                const peerConnection = createPeerConnection(
                    socketId,
                    userId,
                    isMuted,
                    isVideoOn
                );
                await peerConnection.setRemoteDescription(
                    new RTCSessionDescription(offer)
                );
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                socket.emit(
                    "answer",
                    answer,
                    roomId,
                    socketId,
                    localIsMuted,
                    localIsVideoOn
                );
            }
        );
        socket.on("answer", async (answer, socketId, isMuted, isVideoOn) => {
            const peerConnection = peers.get(socketId);
            if (peerConnection) {
                await peerConnection.setRemoteDescription(
                    new RTCSessionDescription(answer)
                );
            }
            const videoElement = document.querySelector(`#video-${socketId}`);
            if (videoElement) {
                videoElement.nextElementSibling.textContent = isMuted
                    ? "Muted"
                    : "Unmuted";
                videoElement.nextElementSibling.nextElementSibling.textContent =
                    isVideoOn ? "Video On" : "Video Off";
            }
        });
        socket.on("ice-candidate", async (candidate, socketId) => {
            const peerConnection = peers.get(socketId);
            if (peerConnection) {
                await peerConnection.addIceCandidate(
                    new RTCIceCandidate(candidate)
                );
                console.log(peerConnection.remoteDescription.sdp);
            }
        });
        socket.on("user-disconnected", (socketId, userId) => {
            const videoElement = document.getElementById(`video-${socketId}`);
            if (videoElement) {
                videoElement.parentElement.remove();
            }
            console.log("User disconnected:", userId);
            if (peers.has(socketId)) {
                peers.get(socketId).close();
                peers.delete(socketId);
            }
        });
        socket.on("user-muted", (socketId, isMuted) => {
            const videoElement = document.getElementById(`video-${socketId}`);
            const statusElement = videoElement.nextElementSibling;

            statusElement.textContent = isMuted ? "Muted" : "Unmuted";
        });
        socket.on("user-video-toggled", (socketId, isVideoOn) => {
            const videoElement = document.getElementById(`video-${socketId}`);
            const statusElement =
                videoElement.nextElementSibling.nextElementSibling;
            statusElement.textContent = isVideoOn ? "Video On" : "Video Off";
        });
        socket.emit("join-room");
    } catch (err) {
        console.error("Error accessing media devices:", err);
    }
}

async function changeMicrophone() {
    if (localStream) {
        localStream.getAudioTracks().forEach((track) => track.stop());
    }
    await getLocalStream();

    peers.forEach((peerConnection) => {
        const audioTrack = localStream.getAudioTracks()[0];
        const sender = peerConnection
            .getSenders()
            .find((s) => s.track.kind === audioTrack.kind);
        if (sender) {
            sender.replaceTrack(audioTrack);
        }
    });
}
async function getLocalStream() {
    const cameraSelect = document.getElementById("cameraSelect");
    const microphoneSelect = document.getElementById("microphoneSelect");
    const resolutionSelect = document.getElementById("resolutionSelect");
    let videoConstraints;

    // switch (resolutionSelect.value) {
    //     case "1080p":
    //         videoConstraints = {
    //             width: { exact: 1920 },
    //             height: { exact: 1080 },
    //         };
    //         break;
    //     case "720p":
    //         videoConstraints = {
    //             width: { exact: 1280 },
    //             height: { exact: 720 },
    //         };
    //         break;
    //     case "480p":
    //         videoConstraints = {
    //             width: { exact: 640 },
    //             height: { exact: 480 },
    //         };
    //         break;
    //     default:
    videoConstraints = {
        width: { exact: 320 },
        height: { exact: 240 },
    };
    // }

    const constraints = {
        video: {
            deviceId: cameraSelect.value
                ? { exact: cameraSelect.value }
                : undefined,
            ...videoConstraints,
        },
        audio: {
            deviceId: microphoneSelect.value
                ? { exact: microphoneSelect.value }
                : undefined,
        },
    };
    localStream = await navigator.mediaDevices.getUserMedia(constraints);
}

async function changeCamera() {
    if (localStream) {
        localStream.getVideoTracks().forEach((track) => track.stop());
    }
    await getLocalStream();
    const videoElement = document.getElementById("video-local");
    if (videoElement) {
        videoElement.srcObject = localStream;
    }

    // Update peer connections with new video track
    peers.forEach((peerConnection) => {
        const videoTrack = localStream.getVideoTracks()[0];
        const sender = peerConnection
            .getSenders()
            .find((s) => s.track.kind === videoTrack.kind);
        if (sender) {
            sender.replaceTrack(videoTrack);
        }
    });
}

function createPeerConnection(socketId, userId, isMuted, isVideoOn) {
    const peerConnection = new RTCPeerConnection(configuration);

    // Add local tracks to the connection
    localStream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, localStream);
    });

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit("ice-candidate", event.candidate, roomId, socketId);
        }
    };

    // Handle incoming streams
    peerConnection.ontrack = (event) => {
        const videoElement = createVideoElement(
            socketId,
            `${
                myData.role == "veterinarian"
                    ? consultation.bookerName
                    : consultation.veterinarianNameAndTitle
            }`,
            isMuted,
            isVideoOn
        );
        videoElement.srcObject = event.streams[0];
    };

    peers.set(socketId, peerConnection);

    return peerConnection;
}

function createVideoElement(socketId, userName, isMuted, isVideoOn) {
    const existingVideo = document.getElementById(`video-${socketId}`);
    if (existingVideo) return existingVideo;

    const wrapper = document.createElement("div");
    wrapper.className = "video-wrapper";

    const video = document.createElement("video");
    video.id = `video-${socketId}`;
    video.autoplay = true;
    video.playsInline = true;

    const label = document.createElement("div");
    label.className = "username";
    label.textContent = userName;

    const statusMic = document.createElement("div");
    statusMic.className = "status-mic";
    statusMic.textContent = isMuted ? "Muted" : "Unmuted";

    const statusVid = document.createElement("div");
    statusVid.className = "status-vid";
    statusVid.textContent = isVideoOn ? "Video On" : "Video Off";

    wrapper.appendChild(video);
    wrapper.appendChild(statusMic);
    wrapper.appendChild(statusVid);
    wrapper.appendChild(label);
    document.getElementById("videoContainer").appendChild(wrapper);
    return video;
}

function toggleMute() {
    localIsMuted = !localIsMuted;
    localStream.getAudioTracks().forEach((track) => {
        track.enabled = !localIsMuted;
    });
    const videoElement = document.getElementById("video-local");
    const statusElement = videoElement.nextElementSibling;
    statusElement.textContent = localIsMuted ? "Muted" : "Unmuted";
    peers.forEach((pc, socketId) => {
        socket.emit("user-muted", socketId, localIsMuted);
    });
}

function toggleVideo() {
    localIsVideoOn = !localIsVideoOn;
    localStream.getVideoTracks().forEach((track) => {
        track.enabled = localIsVideoOn;
        console.log(localIsVideoOn);
    });
    const videoElement = document.getElementById("video-local");
    const statusElement = videoElement.nextElementSibling.nextElementSibling;
    statusElement.textContent = localIsVideoOn ? "Video On" : "Video Off";
    socket.emit("user-video-toggled", localIsVideoOn);
}

async function getCameras() {
    await getLocalStream();

    // Display local video
    const videoElement = createVideoElement(
        "local",
        `You (${myData.name})`,
        localIsMuted,
        localIsVideoOn
    );
    videoElement.muted = true;
    videoElement.srcObject = localStream;

    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(
        (device) => device.kind === "videoinput"
    );
    const cameraSelect = document.getElementById("cameraSelect");
    cameraSelect.innerHTML = "";
    videoDevices.forEach((device) => {
        const option = document.createElement("option");
        option.value = device.deviceId;
        option.text = device.label || `Camera ${cameraSelect.length + 1}`;
        cameraSelect.appendChild(option);
    });
}

// Socket event handlers

// Get available cameras on page load

async function getMicrophones() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioDevices = devices.filter(
        (device) => device.kind === "audioinput"
    );
    const microphoneSelect = document.getElementById("microphoneSelect");
    microphoneSelect.innerHTML = "";
    audioDevices.forEach((device) => {
        const option = document.createElement("option");
        option.value = device.deviceId;
        option.text =
            device.label || `Microphone ${microphoneSelect.length + 1}`;
        microphoneSelect.appendChild(option);
    });
}

// Get available microphones on page load

document.addEventListener("DOMContentLoaded", async () => {
    myData = await getMe();
    consultation = await getConsultation();
    roomId = consultation.id;
    getCameras();
    await getMicrophones();
});
