#!/usr/bin/env node
/*
    requirements.txt
        - vim installation on your system for better handling other vi also can be used 
    how to run it?
        - s3pad s3://<some_path>
            - validations
                - path should be a valid s3 path (valid pattern match)
            - file download the file on local in tmp folder (remember the path)
                - error handling in downloading the file
                - only supports json/txn etc (is it needed or you can edit anything from terminal?)
            - open file in vim 
            - upon change
                - good to have - validation if the file is a valid json file (for now, only json validation is supported)
                - if code === 0
                    - upload the file to s3 
                    - return success
                    - if fails, throw error 
        - custom args
            - --validate=json flag take as input in case you want to validate the file before saving?
*/
const logger        = require('./lib/logger');
const AWS           = require('aws-sdk')
const fs            = require('fs');
const spawn         = require('child_process').spawn;

// suppressing the annoying aws warning. v3 SDK isn't feature complete 
require('aws-sdk/lib/maintenance_mode_message').suppress = true;

const s3Client      = new AWS.S3({ region: 'ap-south-1' });

class S3pad {
    constructor() {
        this.__init__();
    }

    __init__ = async () => {
        const s3Path = this.validateS3Path(process.argv[2])
        await this.run(s3Path);
    }

    validateS3Path = (s3Path) => {
        const s3Regex = /^s3:\/\/([a-zA-Z0-9.-]+)\/(.+)$/;
        const isValidS3FilePath = s3Path.match(s3Regex);

        if(!isValidS3FilePath) {
            this.exit('Invalid S3 file path format. Please use the format s3://bucket-name/path/to/file')
        }

        const parts = s3Path.split('/');

        return {
            bucketName: isValidS3FilePath[1],
            key: isValidS3FilePath[2],
            fileName: parts[parts.length - 1],
        }
    }

    exit = (error) => {
        logger('error', error);
        process.exit(1);
    }

    downloadFile = async (s3Path) => {
        const obj = await s3Client.getObject({
            Bucket: s3Path.bucketName,
            Key: s3Path.key,
        }).promise();
        return obj;
    };
    
    saveFileLocally = (fileContent, filePath) => {
        const fileWriteStream = fs.createWriteStream(filePath);
        fileWriteStream.write(fileContent);
        fileWriteStream.close();
    };
    
    editFileInEditor = (filePath) => {
        const vimProcess = spawn('vi', [filePath], { stdio: 'inherit' });
        return new Promise((resolve) => {
            vimProcess.on('close', (code) => {
                resolve(code);
            });
        });
    };

    unlink = (filePath) => {
        return new Promise((resolve) => {
            fs.unlink(filePath, (err) => {
                if(err) throw err;
                resolve(true);
            });
        })
    }
    
    save = async (localFilePath, s3Bucket, s3Key, contentType) => {
        const updatedFile = fs.readFileSync(localFilePath);
        await s3Client.putObject({
            Bucket: s3Bucket,
            Key: s3Key,
            Body: updatedFile,
            ContentType: contentType,
        }).promise();
        await this.unlink(localFilePath);
    };
    
    run = async (s3Path) => {
        const fileContent = await this.downloadFile(s3Path);
        // TODO - there are better ways of doing this. move to tmp but something weird happened on my local
        const tempPath = process.cwd() + '/' + s3Path.fileName;

        // saving it locally to edit
        this.saveFileLocally(fileContent.Body, tempPath);
    
        const editorExitCode = await this.editFileInEditor(tempPath);
    
        if (editorExitCode === 0) {
            this.save(tempPath, s3Path.bucketName, s3Path.key, fileContent.ContentType);
            logger('info', 'File saved successfully.');
        } else {
            this.exit('Error: Something went wrong with the editor.');
        }
    };
    
}

module.exports = new S3pad();