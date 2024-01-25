module.exports = function (RED) {
    const flowFileName = "flows.json";
    const { BlobServiceClient } = require("@azure/storage-blob");
    const path = require("path");

    function UploadFlows(config) {
        RED.nodes.createNode(this, config);
        this.name = config.name;
        this.connection = config.connection;
        this.container = config.container;
        this.overwrite = config.overwrite;

        let node = this;
        GetClient(node.connection, node.container)
            .then(function (client) {
                node.on("input", function (msg) {
                    var paths = [`/data/${flowFileName}`];
                    Upload(node, msg, client, paths);
                })
            })
            .catch(function (err) {
                node.error(err);
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
        GetClient(node.connection, node.container)
            .then(function (client) {
                node.on("input", function (msg) {
                    var paths = msg.payload;
                    Upload(node, msg, client, paths);
                })
            })
            .catch(function (err) {
                node.error(err);
            });
    }
    RED.nodes.registerType("upload-files", UploadFiles);

    function GetClient(connection, container) {
        return new Promise(function (resolve, reject) {
            let serviceClient = BlobServiceClient.fromConnectionString(connection);
            let containerClient = serviceClient.getContainerClient(container);
            containerClient.createIfNotExists()
                .then(function (ans) {
                    return resolve(containerClient);
                })
                .catch(function (err) {
                    return reject(err);
                });
        });
    }

    function Upload(node, msg, client, paths) {
        let errors = [];
        Promise.allSettled(
            paths.map(function(path) {
                return UploadBlob(client, path, node.overwrite);
        }))
        .then(function (ans) {
            ans.filter(a => a.status == "fulfilled")
                .forEach(function (resolve) {
                    node.log(resolve.value);
                });

            ans.filter(a => a.status == "rejected")
                .forEach(function (reject) {
                    errors.push(reject.reason);
                });
            
            if (errors.length > 0) {
                node.error(JSON.stringify(errors), msg);
            }

            let result = {
                _msgid : msg._msgid,
                payload: "Upload process completed."
            };
            node.send(result);
        });
    }

    function UploadBlob(client, srcFile, overwrite) {
        return new Promise(function (resolve, reject) {
            var destFile = CreateBlobName(srcFile);
            let blobClient = client.getBlockBlobClient(destFile);
            if (!overwrite) {
                blobClient.exists()
                    .then(function (ans) {
                        if (ans) {
                            return reject(`Blob already exists. path:${destFile}`);
                        } else {
                            blobClient.uploadFile(srcFile)
                                .then(function (ans) {
                                    return resolve(CreateUploadLog(destFile));
                                })
                                .catch(function (err) {
                                    return reject(err.message);
                                });
                        }
                    })
                    .catch(function (err) {
                        return reject(err.message);
                    });
            } else {
                blobClient.uploadFile(srcFile)
                    .then(function (ans) {
                        return resolve(CreateUploadLog(destFile));
                    })
                    .catch(function (err) {
                        return reject(err.message);
                    });
            }
        });
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

    function CreateUploadLog(fileName) {
        return `File upload succeeded. path:${fileName}`;
    }
};
