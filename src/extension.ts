import * as vscode from 'vscode'
import * as https from 'https'
import * as zlib from 'zlib'
import { Configuration, ChatCompletionRequestMessage, OpenAIApi, ChatCompletionRequestMessageRoleEnum } from 'openai'
import { IncomingMessage } from 'http'
import { getNonce } from './utilities/getNonce'
import { getUri } from './utilities/getUri'
import { encode } from 'gpt-3-encoder'
const registerContextCommand = (context: vscode.ExtensionContext, command: string, callback: (...args: any[]) => any, thisArg?: any) => context.subscriptions.push(vscode.commands.registerCommand(command, callback, thisArg))

const env = process.env
const openAIAPIKey = env.OPENAI_API_KEY
const openAIOrganization = env?.OPENAI_ORGANIZATION
const stackAPIKey = env.STACKEXCHANGE_API_KEY
const stackExchangeAPIHostName = env.STACKEXCHANGE_API_HOSTNAME
const stackExchangeAPIPath = env.STACKEXCHANGE_API_PATH
const advancedSearchFilter = env.STACKEXCHANGE_ADVANCED_SEARCH_FILTER
const questionFilter = env.STACKEXCHANGE_QUESTION_FILTER
const site = env?.STACKEXCHANGE_SITE
const siteName= env?.STACKEXCHANGE_SITE_NAME
const siteHostName= env?.STACKEXCHANGE_SITE_HOSTNAME

const searchPath = '/search'
const advancedSearchPath = `${stackExchangeAPIPath}/search/advanced`
const askPath = `/questions/ask`
const questionPath = `${stackExchangeAPIPath}/questions`
const advancedQueryStringFormat = (queryString: string) => `sort=relevance&key=${stackAPIKey}&filter=${advancedSearchFilter}&q=${encodeURI(queryString)}${site ? '&site=' + site : ''}`
const questionQueryString = `key=${stackAPIKey}&filter=${questionFilter}${site ? '&site=' + site : ''}`
let extensionUri: vscode.Uri

const configuration = new Configuration({
	organization: openAIOrganization,
  apiKey: openAIAPIKey,
});
const openai = new OpenAIApi(configuration);

function getSelection(): string | undefined {
	const editor = vscode.window?.activeTextEditor
	const selection = editor?.selection;
	return !selection || selection.isEmpty
	? undefined
	: editor.document.getText(new vscode.Range(selection.start.line, selection.start.character, selection.end.line, selection.end.character))
}

function getZippedJSON(options: https.RequestOptions): any {
	return new Promise<any|undefined>((resolve, reject)=>{
		https.get(options, (res: IncomingMessage) => {
			const gunzip = zlib.createGunzip()
			res.pipe(gunzip)
			let body = ""
			gunzip.on("data", (chunk) => {
				body += chunk
			})
			gunzip.on("end", () => {
				try {
					resolve(JSON.parse(body))
				} catch (error: any) {
					console.error("Error parsing JSON: " +error.message)
					resolve(undefined)
				};
			})
			.on("error", function(e) {
				console.error("Error gunzipping JSON: " + e)
				resolve(undefined)
			})
		})
	})
}

async function queryQuestionIDs(queryString: string): Promise<Array<number> | undefined> {
	let queryStringFormatted = advancedQueryStringFormat(queryString)
	console.log(stackExchangeAPIHostName + `${advancedSearchPath}?${queryStringFormatted}`)
	const advancedSearchRequestOptions: https.RequestOptions = {
		host: stackExchangeAPIHostName,
		path: `${advancedSearchPath}?${queryStringFormatted}`
	}
	let res = await getZippedJSON(advancedSearchRequestOptions)
	return res ? res.items?.map((item: any)=> item.question_id) : undefined
}

async function queryFullQuestions(questionIDs: Array<number>): Promise<Array<any> | undefined> {
	const questionsRequestOptions: https.RequestOptions = {
		host: stackExchangeAPIHostName,
		path: `${questionPath}/${questionIDs.join(';')}?${questionQueryString}`
	}
	return (await getZippedJSON(questionsRequestOptions))?.items
}
let instructionMessage: string =  `
	Help a VS Code user with their StackExchange search using the search.
	If possible, summarize or make a suggestion using the data.
	`

function questionToString(question: any, used_quota: number, max_quota: number) {
	let text =
	`${question.title}
	${question.body}

	`
	let numAddedAnswers = 0
	let ratio = used_quota/max_quota
	if (question?.answers) {
		text += question.answers.filter((_: any, i: number)=>{
			if (i <= 2 || ratio < .8) {
				++numAddedAnswers
				return true
			}
			return false
		}).map((answer: any) => {
			if (answer?.is_accepted) {
				text += '(accepted):'
			}
			if (answer.body) {
				text += answer.body
			}
		}).join('`,')
	}
	if (question?.comments) {
		text += question.comments.filter((v:any, numAddedComments:any) =>
			ratio < .5 || (ratio < .7 && numAddedAnswers + numAddedComments < 2) || (numAddedAnswers == 0 && numAddedComments < 2)
		).map((comment: any) => {
			text += 'c:`'
			if (comment?.is_accepted) {
				text += '(accepted):'
			}
			text += ':'
			if (comment.body) {
				text += comment.body
			}
		}).join('`,')
	}
	return text
}

const tokens_reserved = encode(instructionMessage).length + 250

async function askGPTQuestion(originalQuestion: string, stackExchangeData: any[], model: string = 'gpt-3.5-turbo') {
	const token_limit = model.startsWith('gpt-4') ? 8192: 4096
	const tokens_allocated = token_limit - tokens_reserved
	let token_count = tokens_reserved

	let stringifiedData: ChatCompletionRequestMessage[] = [{
		role: ChatCompletionRequestMessageRoleEnum.User,
		content: `instructions: ${instructionMessage}`
	}]
	let messages: any[] = []
	stackExchangeData.forEach((v,i)=> {
		let stringified = questionToString(v, token_count - tokens_reserved, tokens_allocated)
		let q_token_count = encode(stringified).length
		if (token_count + q_token_count < token_limit) {
			token_count += q_token_count
			messages.push(stringified)
		}
	})
	stringifiedData.push({
		role: ChatCompletionRequestMessageRoleEnum.Assistant,
		content: JSON.stringify(messages)
	})
	stringifiedData.push({
		role: ChatCompletionRequestMessageRoleEnum.User,
		content: `query: ${originalQuestion}`
	})
	let response = await openai.createChatCompletion({
		model: 'gpt-3.5-turbo',
		messages: stringifiedData
	}).catch((e)=>{
		console.error("Error retrieving chat completion: " + e)
	})
	return response?.data?.choices[0]?.message?.content
}


async function search(){
	let inputBoxOptions: vscode.InputBoxOptions = {
		ignoreFocusOut: true,
		placeHolder: `what's your question`
	}
	const selection = getSelection()
	if (selection) {
		inputBoxOptions = {
			...inputBoxOptions,
			value: selection,
		}
	}
	const searchQuery = await vscode.window.showInputBox(inputBoxOptions);
	if (searchQuery) {
		let questionIDs: any = await queryQuestionIDs(searchQuery)
		let questions: any[] = []
		if (questionIDs) {
			let res = await queryFullQuestions(questionIDs)
			if (res) {
				questions = res
			}
		}
		let gptAnswer: any = "no answer"
		const panel = vscode.window.createWebviewPanel(
			`${siteName}`,
			`${siteName} Results`,
			vscode.ViewColumn.One,
			{
				enableScripts: true,
				retainContextWhenHidden: true
			}
		)
		const webviewUri = getUri(panel.webview, extensionUri, ["out", "webview.js"])
		panel.webview.html = `
		<!DOCTYPE html>
			<html lang="en">
			<head>
			  <title>StackOverflow Results</title>
			</head>
			<body>
				<script>
					window.addEventListener('message', event => {

						const message = event.data;

						switch (message.command) {
								case 'gptAnswer':
										let output = document.getElementById("chatGPTOutput")
										output.innerHTML = message.content
										break;
						}
					});
				</script>
				<script type="module" nonce="${getNonce()}" src="${webviewUri}"></script>
				<table>
					<tr>
						<h4>GPT Suggestion based on results</h4>
						<div id='chatGPTOutput' style="max-width:350px;"><vscode-progress-ring/></vscode-progress-ring></div>
					</tr>
					<br>
					<tr>
						<vscode-link href="https://${siteHostName}${searchPath}?q=${searchQuery}"/>
							<h3>Search on ${siteName}</h3>
						</vscode-link>
					</tr>
					<br>
					<tr>
					<vscode-link href="https://${siteHostName}${askPath}?title=${searchQuery}"/>
						<h3>Ask as a ${siteName} Question</h3>
					</vscode-link>
					</tr>
					<br>
					${questions.map((item: any)=>{
						return `
						<tr>
							<h5><vscode-link href="${item?.link}">${item.title}</vscode-link></h5>
							<p>${ item.body.length <= 180 ? item.body : item.body.slice(0, 180) + '...' }</p>
						</tr>
						<br>
						`
					}).join('')}
				</table>
			</body>
		`
		if (questions.length) {
			(async () => {
				gptAnswer = await askGPTQuestion(searchQuery, questions)
				panel.webview.postMessage({ command: 'gptAnswer', content: gptAnswer ?? "No answer found" })
			})();
		}
	}
}

export function activate(context: vscode.ExtensionContext) {
	extensionUri = context.extensionUri
	registerContextCommand(context, 'StackExchangeInvestigator.search', search);
}

export function deactivate() {}
