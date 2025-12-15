const AudioEngine = {
    system: null,
    FMOD: {},
    currentSound: null,
    currentChannel: null,
    pitchShiftDSP: null,
    shiftStatus: false,
    baseFrequency: 44100.0,
    currentTempo: 1.00,
    minTempo: 0.5,
    maxTempo: 2.0,
    precision: 2,

    readyUI: function(flag) {
        const ids = [
            'btnPlay', 'btnDSP', 
            'btnRw', 'btnFw', 'btnRw30', 'btnFw30',
            'btnSlow', 'btnFast', 'btnSlowMax', 'btnFastMax', 'btnResetTempo'
        ];
        
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.disabled = !flag; // Flip flag for enabling/disabling
            else console.warn(`Element '${id}' is not found.`);
        });

        const status = document.getElementById('status');
        if (status) {
            status.textContent = flag ? "Ready to Play." : "Processing...";
        }
    },

    init: function(onReadyCallback) {
        this.FMOD = {
            'onRuntimeInitialized': () => this._internalSetup(onReadyCallback),
            'onError': (msg) => console.error(msg)
        };
        FMODModule(this.FMOD);
    },

    _internalSetup: function(callback) {
        var outStream = {};
        this.FMOD.System_Create(outStream);
        this.system = outStream.val;
        this.system.init(2048, this.FMOD.INIT_NORMAL, null);
        if (callback) callback();
    },

    resumeContext: function() {
        this.system.mixerSuspend();
        this.system.mixerResume();
    },

    playTrack: function(file) {
        if (this.currentChannel) {
            this.currentChannel.stop();
            this.currentChannel = null;
        }
        
        const reader = new FileReader();
        reader.onload = (e) => this._loadAndPlayBuffer(e.target.result);
        reader.readAsArrayBuffer(file);
    },

    _loadAndPlayBuffer: function(arrayBuffer) {
        try { this.FMOD.FS_unlink('/track.mp3'); } catch(e){}
        
        var uint8View = new Uint8Array(arrayBuffer);
        this.FMOD.FS_createDataFile('/', 'track.mp3', uint8View, true, false, false);

        var outSound = {};
        var mode = this.FMOD.DEFAULT | this.FMOD.CREATESAMPLE | this.FMOD.LOOP_NORMAL;
        var result = this.system.createSound('/track.mp3', mode, null, outSound);

        if (result === this.FMOD.OK) {
            this.currentSound = outSound.val;
            
            var outChannel = {};
            //                                             ↓ auto-play disabled
            this.system.playSound(this.currentSound, null, true, outChannel);
            this.currentChannel = outChannel.val;
            this.currentChannel.setVolume(0.5);

            var outFreq = {};
            this.currentChannel.getFrequency(outFreq);
            this.baseFrequency = outFreq.val;

            var outDsp = {};
            var dspRes = this.system.createDSPByType(this.FMOD.DSP_TYPE_PITCHSHIFT, outDsp); 
            
            if (dspRes === this.FMOD.OK) {
                this.pitchShiftDSP = outDsp.val;
                this.pitchShiftDSP.setParameterInt(1, 4096);
                this.currentChannel.addDSP(0, this.pitchShiftDSP);
                this.setTempo(this.currentTempo);
            }
        }

        this.readyUI(true);
        // Enable UI after loading
    },

    shiftFlip: function() {
        this.shiftStatus = !this.shiftStatus;

        const display = document.getElementById('DSPDisp');
        if(display) display.textContent = this.shiftStatus ? "Off" : "On";

        this.setTempo(this.currentTempo);
    },

    setTempo: function(multiplier) {

        if (multiplier < this.minTempo) multiplier = this.minTempo;
        if (multiplier > this.maxTempo) multiplier = this.maxTempo;

        multiplier = Math.round(multiplier * 100) / 100; // Round to 2 d.p.
        this.currentTempo = multiplier;

        this.currentChannel.setFrequency(this.baseFrequency * multiplier);

        if (this.pitchShiftDSP) {
            let pitch = this.shiftStatus ? 1.0 : (1.0 / multiplier);
            this.pitchShiftDSP.setParameterFloat(0, pitch);
        }
        
        const display = document.getElementById('tempoDisp');
        if(display) display.textContent = multiplier.toFixed(this.precision) + "x";
    },

    seekControl: function(deltaMs) {
        var outPos = {};
        var outLen = {};

        this.currentChannel.getPosition(outPos, this.FMOD.TIMEUNIT_MS);            
        this.currentSound.getLength(outLen, this.FMOD.TIMEUNIT_MS);
            
        let newPos = outPos.val + deltaMs;
        if (newPos < 0) newPos = 0;
        if (newPos > outLen.val) newPos = outLen.val;

        this.currentChannel.setPosition(newPos, this.FMOD.TIMEUNIT_MS);
    }
};

AudioEngine.init(function() {
    const fileInput = document.getElementById('fileInput');
    const smallChange = 0.05;
    const largeChange = 0.25;
    const timeConst = 1000 * 100; // *100 to negate %
    
    fileInput.disabled = false;
    //  Disable file input until FMOD is ready
    AudioEngine.readyUI(false);
    //  Disable other UI until a track is loaded

    fileInput.addEventListener('change', (e) => {
        if(e.target.files[0]) {
            AudioEngine.resumeContext();
            document.getElementById('status').textContent = "Loading...";       
            AudioEngine.playTrack(e.target.files[0]);
        }
    });

    document.getElementById('btnPlay').addEventListener('click', () => {
        AudioEngine.resumeContext();
        var p = {}; 
        AudioEngine.currentChannel.getPaused(p);
        AudioEngine.currentChannel.setPaused(!p.val); 
    });

    document.getElementById('btnDSP').addEventListener('click', () => {
        AudioEngine.shiftFlip();
    });

    // Seek Controls
    document.getElementById('btnRw').addEventListener('click', () => {
        AudioEngine.seekControl(-smallChange * timeConst); // - 5s
    });
    document.getElementById('btnFw').addEventListener('click', () => {
        AudioEngine.seekControl(smallChange * timeConst); // + 5s
    });
    document.getElementById('btnRw30').addEventListener('click', () => {
        AudioEngine.seekControl(-largeChange * timeConst); // - 30s
    });
    document.getElementById('btnFw30').addEventListener('click', () => {
        AudioEngine.seekControl(largeChange * timeConst); // + 30s
    });


    // Tempo Controls
    document.getElementById('btnSlow').addEventListener('click', () => {
        AudioEngine.setTempo(AudioEngine.currentTempo - smallChange);
    });
    document.getElementById('btnFast').addEventListener('click', () => {
        AudioEngine.setTempo(AudioEngine.currentTempo + smallChange);
    });
    document.getElementById('btnSlowMax').addEventListener('click', () => {
        AudioEngine.setTempo(AudioEngine.currentTempo - largeChange);
    });
    document.getElementById('btnFastMax').addEventListener('click', () => {
        AudioEngine.setTempo(AudioEngine.currentTempo + largeChange);
    });
    document.getElementById('btnResetTempo').addEventListener('click', () => {
        AudioEngine.setTempo(1.0);
    });
});