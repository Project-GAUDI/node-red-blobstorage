module.exports = function (RED) {
    const flowFileName = "flows.json";
    const { BlobServiceClient } = require("@azure/storage-blob");
    const path = require("path");

    const statusEnum = {
        disconnected: { color: "red", text: "Disconnected" },
        connected: { color: "green", text: "Connected" },
        uploading: { color: "blue", text: "Uploading file" },
        error: { color: "grey", text: "Error" }
    };

    function UploadFlows(config) {
        RED.nodes.createNode(this, config);
        this.name = config.name;
        this.connection = config.connection;
        this.container = config.container;
        this.overwrite = config.overwrite;

        let node = this;
        setStatus(node,statusEnum.disconnected);

        GetClient(node)
            .then(function (client) {
                setStatus(node,statusEnum.connected);

                node.on("input", function (msg) {
                    var paths = [`/data/${flowFileName}`];
                    try{
                        Upload(node, msg, client, paths);
                    }catch(err){
                        node.error(err,msg);
                        node.log(`upload-flows.Upload Error : ${err.message}`);
                        setStatus(node,statusEnum.error);
                    }
                })
            })
            .catch(function (err) {
                node.error(err, {});
                node.log(`upload-flows.GetClient Error : ${err.message}`);
            });
    }
    RED.nodes.registerType("upload-flows", UploadFlows);

    function UploadFiles(config) {
        RED.nodes.createNode(this, config);
        this.name = config.name;
        this.connection = config.connection;
        this.container = config.container;
        this.overwrite = config.overwrite;

        let node = this;
        setStatus(node,statusEnum.disconnected);
        GetClient(node)
            .then(function (client) {
                setStatus(node,statusEnum.connected);

                node.on("input", function (msg) {
                    try{
                        if(false == ("payload" in msg)){
                            throw new Error("msg.payload is not exist.");
                        }
                        if(msg.payload === null || typeof msg.payload != "object"){
                            throw new Error("Format of msg.payload is invalid.");
                        }
                        var paths = msg.payload;
                        Upload(node, msg, client, paths);
                    }catch(err){
                        node.error(err,msg);
                        node.log(`upload-files.Upload Error : ${err.message}`);
                        setStatus(node,statusEnum.error);
                    }
                })
            })
            .catch(function (err) {
                node.error(err, {});
                node.log(`upload-files.Upload Error : ${err.message}`);
            });
    }
    RED.nodes.registerType("upload-files", UploadFiles);

    function GetClient(node) {
        // retry parameters
        const timeOut = 1000;
        const maxRetryNum = 3;

        return new Promise(function (resolve, reject) {
            let serviceClient, containerClient;
            function connectStorage(retries) {
                try {
                    serviceClient = BlobServiceClient.fromConnectionString(node.connection);
                    containerClient = serviceClient.getContainerClient(node.container);
                } catch (err) {
                    if (retries < maxRetryNum) {
                        node.debug(`Retry to connect to storage account (retries=${retries+1})`);
                        setTimeout(function() { connectStorage(retries+1); }, timeOut);
                    } else {
                        node.debug(`Failed to connect to storage account (retries=${retries})`);
                        return reject(err);
                    }
                    return;
                }
                createContainer(0);
            }

            function createContainer(retries) {
                containerClient.createIfNotExists()
                    .then(function (ans) {
                        return resolve(containerClient);
                    })
                    .catch(function (err) {
                        if (retries < maxRetryNum) {
                            node.debug(`Retry to create blob container (retries=${retries+1})`);
                            setTimeout(function() { createContainer(retries+1); }, timeOut);
                        } else {
                            node.debug(`Failed to create blob container (retries=${retries})`);
                            return reject(err);
                        }
                    });
            }
            connectStorage(0);
        });
    }

    function Upload(node, msg, client, paths) {
        setStatus(node,statusEnum.uploading);

        let succeededPaths = {
            inputPathList: [],
            blobPathList: []
        };
        let faliledPaths = {
            inputPathList: [],
            blobPathList: []
        };
        let errors = [];
        let resultText = "Upload process succeeded.";

        let { srcFilePaths, destFilePaths } = GetFilePathList(paths);

        Promise.allSettled(
            srcFilePaths.map(function(srcFilePath,index) {
                let destFilePath = destFilePaths[index];
                return UploadBlob(client, srcFilePath, destFilePath, node.overwrite);

        }))
        .then(function (ans) {
            ans.filter(a => a.status == "fulfilled")
                .forEach(function (resolve) {
                    node.log(`${resolve.value.message} path:${resolve.value.inputPath}`);
                    succeededPaths.inputPathList.push(resolve.value.inputPath);
                    succeededPaths.blobPathList.push(resolve.value.blobPath);
                });

            ans.filter(a => a.status == "rejected")
                .forEach(function (reject) {
                    errors.push(reject.reason.error);
                    faliledPaths.inputPathList.push(reject.reason.inputPath);
                    faliledPaths.blobPathList.push(reject.reason.blobPath);
                });

            if (errors.length > 0) {
                let msgObj = {...msg, faliledPaths: faliledPaths};
                node.error(JSON.stringify(errors), msgObj);
                node.log(`Upload Error : ${JSON.stringify(errors)}`);
                resultText = "Upload process failed.";
                setStatus(node,statusEnum.error);
            }else{
                setStatus(node,statusEnum.connected);
            }

            let result = {
                _msgid: msg._msgid,
                payload: resultText,
                inputMessage: msg,
                succeededPaths: succeededPaths
            };
            node.send(result);
        });
    }

    function UploadBlob(client, srcFile, destFile, overwrite) {
        return new Promise(function (resolve, reject) {
            try{
                let blobClient = client.getBlockBlobClient(destFile);
                if (!overwrite) {
                    blobClient.exists()
                        .then(function (ans) {
                            if (ans) {
                                return reject(CreateUploadFailedObj(new Error(`Blob already exists. path:${destFile}`),srcFile,destFile));
                            } else {
                                blobClient.uploadFile(srcFile)
                                    .then(function (ans) {
                                        return resolve(CreateUploadSucceededObj(srcFile,destFile));
                                    })
                                    .catch(function (err) {
                                        err.message= `Upload blob Failed. ${err}`;
                                        return reject(CreateUploadFailedObj(err,srcFile,destFile));
                                    });
                            }
                        })
                        .catch(function (err) {
                            err.message= `Check blob existence Failed. ${err}`;
                            return reject(CreateUploadFailedObj(err,srcFile,destFile));
                        });
                } else {
                    blobClient.uploadFile(srcFile)
                        .then(function (ans) {
                            return resolve(CreateUploadSucceededObj(srcFile,destFile));
                        })
                        .catch(function (err) {
                            err.message= `Upload blob Failed. ${err}`;
                            return reject(CreateUploadFailedObj(err,srcFile,destFile));
                        });
                }
            }catch(err){
                err.message= `Upload blob process failed. ${err}`;
                return reject(CreateUploadFailedObj(err,srcFile,destFile));
            }
        });
    }

    function GetFilePathList(paths){
        var srcFilePaths;
        var destFilePaths;
        if(Array.isArray(paths)){
            // 旧形式(msg.payload=入力ファイル名配列)
            srcFilePaths = paths;
            destFilePaths = paths.map(function(path){
                return CreateBlobName(path);
            });
        }else{
            // 新形式(msg.payload=入出力ファイル名オブジェクト)
            if (false == ("inputPathList" in paths)) {
                throw new Error("inputPathList is not exist in msg.payload.");
            }
            if (false == ("blobPathList" in paths)) {
                throw new Error("blobPathList is not exist in msg.payload.");
            }

            if(false == (Array.isArray(paths.inputPathList))){
                throw new Error("inputPathList is not Array.");
            }

            if(false == (Array.isArray(paths.blobPathList))){
                throw new Error("blobPathList is not Array.");
            }

            if(paths.inputPathList.length != paths.blobPathList.length){
                throw new Error("The lengths of inputPathList and blobPathList do not match.");
            }

            srcFilePaths = paths.inputPathList;
            destFilePaths = paths.blobPathList;

            if(destFilePaths.some(destFile => destFile.startsWith("/"))){
                throw new Error("blobPath can't set / at the start of sentence.");
            }
        }
        return { srcFilePaths, destFilePaths };
    }

    function CreateBlobName(srcFileName) {
        var fileName = path.basename(srcFileName);
        if (fileName == flowFileName) {
            return fileName;
        } else {
            var directoryName = path.basename(path.dirname(srcFileName));
            return `${directoryName}/${fileName}`;
        }
    }

    function CreateUploadSucceededObj(srcFile,destFile) {
        let retObj = {
            message: "File upload succeeded.",
            inputPath: srcFile,
            blobPath: destFile
        }
        return retObj;
    }

    function CreateUploadFailedObj(err,srcFile,destFile) {
        let retObj = {
            error: err.message,
            inputPath: srcFile,
            blobPath: destFile
        }
        return retObj;
    }

    var setStatus = function (node, status) {
        node.status({ fill: status.color, shape: "dot", text: status.text });
    }
};
