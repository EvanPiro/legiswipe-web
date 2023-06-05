module Route exposing (Route(..), billToUrl, route, toRoute)

import Bill exposing (Bill)
import Url exposing (Url)
import Url.Builder exposing (absolute)
import Url.Parser exposing ((</>), Parser, map, oneOf, parse, s, string, top)


type Route
    = Home
    | Bill String String
    | NotFound


route : Parser (Route -> a) a
route =
    oneOf
        [ map Home top
        , map Bill (s "bill" </> string </> string)
        ]


toRoute : String -> Route
toRoute string =
    case Url.fromString string of
        Nothing ->
            NotFound

        Just url ->
            Maybe.withDefault NotFound (parse route url)


billToUrl : Bill -> String
billToUrl bill =
    absolute [ bill.type_, bill.number ] []
