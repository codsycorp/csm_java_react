# InvokeFunction Example Project

The is a example project for InvokeFunction.

This example **cannot be debugged online**. To debug, you can download it locally and replace the [AK](https://usercenter.console.aliyun.com/#/manage/ak) and parameters before debugging.

## Prerequisites

- Download and extract the code for the required language;


- Obtain your [credentials](https://usercenter.console.aliyun.com/#/manage/ak) from your Alibaba Cloud account and use them to replace the ACCESS_KEY_ID and ACCESS_KEY_SECRET in the downloaded code;

- Execute the build and run commands for the corresponding language.

## Execution Steps

After downloading the code package, and modifying the parameters and AK in the code as needed, you can execute the following steps in the **directory where the code was extracted**:

- *You must use Java 8 or later.*
```sh
mvn clean package
java -jar target/sample-1.0.0-jar-with-dependencies.jar
```
## API Used

-  InvokeFunction: Invokes a function. For more information, you can refer to the [document](https://next.api.aliyun.com/document/FC/2023-03-30/InvokeFunction)

## API Return Example

*The actual output structure may vary slightly, which is a normal response; the following output values are for reference only and the actual call results shall prevail.*


- JSON format 
```js
"response"
```

