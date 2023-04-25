module Api exposing (addKey, url)


url : String -> String
url apiKey =
    "https://api.congress.gov/v3/bill?api_key=" ++ apiKey


addKey : String -> String -> String
addKey key endpoint =
    endpoint ++ "&api_key=" ++ key
