let app = {
    init: function () {
        document.getElementById('btn').addEventListener('click', app.takephoto);
    },
    takephoto: function () {
        let opts = {
            quality: 80,
            destinationType: Camera.DestinationType.FILE_URI,
            sourceType: Camera.PictureSourceType.CAMERA,
            mediaType: Camera.MediaType.PICTURE,
            encodingType: Camera.EncodingType.JPEG,
            cameraDirection: Camera.Direction.BACK,
            targetWidth: 300,
            targetHeight: 400
        };

        navigator.camera.getPicture(app.ftw, app.wtf, opts);
    },
    ftw: function (imgURI) {
        document.getElementById('photo').src = imgURI;
        var image = document.getElementById("photo");
        image.setAttribute('style', 'transform:rotate(270deg)');
        image.setAttribute('style', 'width:100%');

    },
    wtf: function (msg) {
        document.getElementById('msg').textContent = msg;
    }
};

document.addEventListener('deviceready', app.init);