# nodejs-ppt-to-img
在linux 下ppt 转图片

在根目录下新建qiniu.config.js文件

    module.exports = {
    	access_key: "####",
    	secret_key: "#####",
    	domain: "#######",
    	space: "####"
    }


##使用条件：

 1. 使用ubuntu 12.04
 2. 安装apt-get install imageMagick libreoffice
 3. 安装nodejs 非node
 4. 配置好qiniu.config.js
 

##nodejs安装方式：

 1. apt-get install python-software-properties python g++ make
 2. add-apt-repository ppa:chris-lea/node.js
 3. apt-get update
 4. apt-get install nodejs