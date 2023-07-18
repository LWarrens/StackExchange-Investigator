# StackExchange Investigator

VS Code extension for StackExchange Search.
This allows a user to quickly return search results and uses OpenAI for a quick interpretation of results.

## Requirements

Runs using `yarn`
Dependencies available in package.json

## Extension Settings

This extension contributes the following settings:

* `StackExchangeInvestigator.search`: execute the ufix search starting the field with any text selected


## How To Run

### prerequisites
Run `yarn` to install all dependencies

Fill in all fields in a key value config file named '.env'
OpenAI and Stack Overflow API keys, the stack overflow site url, and the data filters as described https://api.stackexchange.com/docs/filters

### development
`yarn watch`

#### direnv

##### creating filters
[StackExchange Docs](https://api.stackexchange.com/docs/filters)

ex.
http://api.stackexchange.com/2.3/filters/create?include=.items%3Bquestion.question_id&unsafe=false&base=none

(key needed as well)
##### creating filters


```
OPENAI_API_KEY=<OpenAI key>
OPENAI_ORGANIZATION_ID=<Your org, if any (optional)>
STACKEXCHANGE_API_HOSTNAME=<stackexchange api hostname>
STACKEXCHANGE_API_KEY=<stackexchange api key>
STACKEXCHANGE_QUESTION_FILTER=<filter with include:'.items;question.question_id' base=none unsafe=false>
STACKEXCHANGE_ADVANCED_SEARCH_FILTER=<filter with include:'.items;answer.body;answer.up_vote_count;answer.down_vote_count;answer.is_accepted;comment.body;comment.score;question.body;question.comment;question.link;question.question_id;question.title;question.answers;question.comments;' base=none unsafe=false>
STACKEXCHANGE_SITE_NAME=<stack site display name>
STACKEXCHANGE_SITE_HOSTNAME=<url for new questions>
STACKEXCHANGE_API_PATH=<path ending with version 2.3 e.g. '/api/2.3'>
```


### for creating the actual extension:

`yarn vscode:prepublish`
then add the package to your vscode instance.

# How to use:

Search the command palette for `StackExchange` and run the command or right click after selecting text in the editor
Optionally, set a shortcut to the command.
