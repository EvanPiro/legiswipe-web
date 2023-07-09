# Action Plan
June 29, 2023

## Objectives
Make a twitter bot that posts daily bills from the congressional API and exposes a poll for yes or no votes.

## Logic
- Register, 
- Check for new bills every day
- For each new bill, post a tweet (less than 10,000) composed of the following
  - Quoted title
  - Latest action
  - Link to the bill page on the congressional website
  - Hashtag of sponsor, mention of sponsor
  - Poll
    - Yes
    - No

## Tasks
- [x] Build bill tweet queue
- [x] Build bills index and script for API to DynamoDB operation
- [x] Integrate bill request per metadata item
- [x] Write twitter send function with the aforementioned tweet data
- [x] Register for twitter API and add creds to env on local
- [x] Write scheduled task that queries DDB for bills no tweeted
- [x] Integrate twitter send function
