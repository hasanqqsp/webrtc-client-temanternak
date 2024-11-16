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
let lastReceivedMessageId = "";
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
    socket = io("https://realtime.temanternak.h14.my.id/", {
      extraHeaders: {
        authorization: `bearer ${consultation.token}`,
      },
    });
    lastReceivedMessageId = "";
    // Join room

    document.getElementById("messages").innerHTML = "";
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
        localIsVideoOn,
        query.get("token") || authToken
      );
    });
    socket.on("offer", async (offer, socketId, userId, isMuted, isVideoOn) => {
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
    });
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
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      }
    });
    socket.on("user-disconnected", (socketId, userId) => {
      const videoElement = document.getElementById(`video-${socketId}`);
      if (videoElement) {
        videoElement.parentElement.remove();
      }
      console.log("User disconnected:", socketId);
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
      const statusElement = videoElement.nextElementSibling.nextElementSibling;
      statusElement.textContent = isVideoOn ? "Video On" : "Video Off";
    });
    socket.emit("join-room", query.get("token"), query.get("id"));

    // Replace join button with leave button
    const joinButton = document.getElementById("joinBtn");
    joinButton.textContent = "Leave Room";
    joinButton.onclick = leaveRoom;
  } catch (err) {
    console.error("Error accessing media devices:", err);
  }

  // Mendengarkan pesan yang dikirim ke klien
  socket.on("receiveMessage", (message) => {
    console.log("receiveMessage", message);
    displayMessage(message);
    localStorage.setItem("lastReceivedMessageId", lastReceivedMessageId);
  });

  // Mendengarkan pesan lama saat pertama kali terhubung
  socket.on("previousMessages", (messages) => {
    messages.forEach((message) => {
      displayMessage(message);
    });
    localStorage.setItem("lastReceivedMessageId", lastReceivedMessageId);
  });

  // Mendengarkan pesan baru setelah reconnect
  socket.on("receiveNewMessages", (messages) => {
    messages.forEach((message) => {
      displayMessage(message);
    });
    localStorage.setItem("lastReceivedMessageId", lastReceivedMessageId);
  });

  // Kirim pesan baru
  function sendMessage(content) {
    console.log("sendMessage", content);
    const message = { message: content };
    socket.emit("sendMessage", message);
  }

  // Meminta pesan baru setelah reconnect
  function requestNewMessages() {
    socket.emit("getNewMessages", lastReceivedMessageId);
  }

  // Fungsi untuk menampilkan pesan di UI
  function displayMessage(msg) {
    if (msg.id > lastReceivedMessageId) {
      const messageElement = document.createElement("li");
      messageElement.className = "chat-bubble";
      if (msg.userId == myData.id) {
        messageElement.classList.add("right");
      } else {
        messageElement.classList.add("left");
      }
      console.log(messageElement);

      if (msg.message?.startsWith("WITHFILE:")) {
        const message = msg.message.split("END;");
        const fileUrl = message[0].replace("WITHFILE:", "");
        const messageContent = message[1];
        const img = document.createElement("img");
        img.src = `https://api.temanternak.h14.my.id/${fileUrl}`;
        img.style.width = "400px";
        img.style.maxWidth = "100%";
        const strong = document.createElement("strong");
        strong.textContent = `${
          myData.id == msg.userId
            ? `You (${
                myData.role == "veterinarian"
                  ? consultation.veterinarianNameAndTitle
                  : consultation.bookerName
              })`
            : myData.role == "veterinarian"
            ? consultation.bookerName
            : consultation.veterinarianNameAndTitle
        }`;
        messageElement.appendChild(strong);
        messageElement.appendChild(img);
        const p = document.createElement("p");
        p.textContent = `${messageContent}`;
        messageElement.appendChild(p);
        document.getElementById("messages").appendChild(messageElement);
      } else {
        const strong = document.createElement("strong");
        strong.textContent = `${
          myData.id == msg.userId
            ? `You (${
                myData.role == "veterinarian"
                  ? consultation.veterinarianNameAndTitle
                  : consultation.bookerName
              })`
            : myData.role == "veterinarian"
            ? consultation.bookerName
            : consultation.veterinarianNameAndTitle
        }`;
        const p = document.createElement("p");
        p.textContent = msg.message;
        messageElement.appendChild(strong);
        messageElement.appendChild(p);
        document.getElementById("messages").appendChild(messageElement);
      }
      lastReceivedMessageId = msg.id;
    }
  }

  const messageInput = document.getElementById("messageInput");
  const chatForm = document.getElementById("chatForm");

  chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    file = document.getElementById("fileInput").files[0];
    const formData = new FormData();
    formData.append("file", file);
    formData.append("document_type", "message-media");
    if (file && file.size > 0) {
      const uploadResponse = await fetch(
        "https://api.temanternak.h14.my.id/users/my/files",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${query.get("token") || authToken}`,
          },
          body: formData,
        }
      );

      if (uploadResponse.ok) {
        const uploadResult = await uploadResponse.json();
        sendMessage(
          `WITHFILE:${uploadResult.data.pathname}END;${messageInput.value}`
        );
      } else {
        console.error("File upload failed");
      }
    } else {
      sendMessage(messageInput.value);
    }

    messageInput.value = "";
    file = null;
  });
  // Meminta pesan baru saat klien online kembali
  window.addEventListener("focus", () => {
    requestNewMessages();
  });
}

async function leaveRoom() {
  console.log("Leave Room");

  // Close all peer connections
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  peers.forEach((peerConnection) => {
    peerConnection.close();
  });
  peers.clear();

  // Close socket connection

  document.querySelectorAll(".video-wrapper").forEach((video) => {
    if (!video.querySelector("#video-local")) video.remove();
  });

  // Replace leave button with join button
  const joinButton = document.getElementById("joinBtn");
  joinButton.textContent = "Join Room";
  joinButton.onclick = joinRoom;
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

  const constraints = {
    video: {
      deviceId: cameraSelect.value ? { exact: cameraSelect.value } : undefined,
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
  peerConnection.onconnectionstatechange = () => {
    switch (peerConnection.connectionState) {
      case "disconnected":
        setOnlineStatus("Disconnecting…");

      case "closed":
        setOnlineStatus("Offline");

      case "failed":
        document.getElementById("video-" + socketId).parentElement.remove();
        break;
      default:
        break;
    }
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
  const videoDevices = devices.filter((device) => device.kind === "videoinput");
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
  const audioDevices = devices.filter((device) => device.kind === "audioinput");
  const microphoneSelect = document.getElementById("microphoneSelect");
  microphoneSelect.innerHTML = "";
  audioDevices.forEach((device) => {
    const option = document.createElement("option");
    option.value = device.deviceId;
    option.text = device.label || `Microphone ${microphoneSelect.length + 1}`;
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

  const joinButton = document.getElementById("joinBtn");
  joinButton.onclick = joinRoom;
  document.getElementById("meeting-info").innerHTML = `
    <h1>${consultation.serviceName}</h1>
    <p>Dokter : ${consultation.veterinarianNameAndTitle}</p>
    <p>Pelanggan : ${consultation.bookerName}</p>
    <p>Waktu Mulai : ${new Date(consultation.startTime).toLocaleString()}</p>
    <p>Waktu Selesai : ${new Date(consultation.endTime).toLocaleString()}</p>
    <span id="timer" class="p-1 bg-danger" >00.00.00</span>
      `;
  const timer = document.getElementById("timer");
  const countDownDate = new Date(consultation.endTime).getTime();

  const interval = setInterval(() => {
    const now = new Date().getTime();
    const startTime = new Date(consultation.startTime).getTime();
    let distance;
    if (startTime > new Date().getTime()) {
      console.log("distance", startTime - now);
      distance = startTime - now;
      timer.classList.remove("bg-danger");
      timer.classList.add("bg-success");
      if (distance === 600000) {
        consultation = getConsultation();
      }
    } else {
      distance = countDownDate - now;
      timer.classList.remove("bg-success");
      timer.classList.add("bg-danger");
    }

    const hours = Math.floor(
      (distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
    );
    const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((distance % (1000 * 60)) / 1000);

    timer.textContent = `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;

    if (distance < -10) {
      clearInterval(interval);
      // timer.textContent = "EXPIRED";
      leaveRoom();
    }
  }, 1000);
});
